import { z } from 'zod';
import { RuleDefinition, type PipelineStep, type Predicate, type TransformOp } from './dsl.js';

/**
 * Runtime context passed to the executor by the worker. The executor stays
 * pure: side effects happen through these injected hooks.
 */
export interface RuleContext {
  /** Run a structured-output AI call. Worker provides metering + provider. */
  aiClassify(input: {
    op: 'classify' | 'extract' | 'summarize';
    schema: Record<string, string>;
    text: string;
  }): Promise<unknown>;
  now(): Date;
}

export interface MessageView {
  id: string;
  channel: string;
  subject: string | null;
  contentText: string | null;
  sender: { name?: string | undefined; email?: string | undefined; phone?: string | undefined } | null;
  metadata: Record<string, unknown>;
  attachments: Array<{ filename: string; mimeType: string; sizeBytes: number }>;
}

export interface ResolvedFanoutTarget {
  destination: string;
  with?: Record<string, unknown>;
}

export interface RuleResult {
  matched: boolean;
  /** Computed values produced by transforms; merged into message.contentJson. */
  derived: Record<string, unknown>;
  /** Targets to dispatch (after de-dup). */
  fanout: ResolvedFanoutTarget[];
  /** Tags collected by `set` ops on `tags`. */
  tags: string[];
  onFailure: 'fallback' | 'continue' | 'stop';
}

export async function executeRule(
  raw: unknown,
  message: MessageView,
  ctx: RuleContext,
): Promise<RuleResult> {
  const def = RuleDefinition.parse(raw);
  const result: RuleResult = {
    matched: false,
    derived: {},
    fanout: [],
    tags: [],
    onFailure: 'fallback',
  };

  for (const step of def.pipeline) {
    if ('match' in step) {
      const ok = evaluatePredicate(step.match, { message, derived: result.derived });
      if (!ok) {
        // Both 'skip' and 'stop' abort the rule when used as a guard. The
        // distinction matters at the orchestrator level: 'stop' could be
        // extended to halt subsequent rules, 'skip' lets them run.
        return result;
      }
      result.matched = true;
    } else if ('transform' in step) {
      await applyTransforms(step.transform, message, result, ctx);
    } else if ('route' in step) {
      const seen = new Set<string>();
      for (const t of step.route.fanout) {
        if (seen.has(t.destination)) continue;
        seen.add(t.destination);
        const ft: ResolvedFanoutTarget = { destination: t.destination };
        if (t.with !== undefined) ft.with = t.with;
        result.fanout.push(ft);
      }
      result.onFailure = step.route.on_failure;
    }
  }
  return result;
}

async function applyTransforms(
  ops: readonly TransformOp[],
  message: MessageView,
  result: RuleResult,
  ctx: RuleContext,
) {
  for (const op of ops) {
    switch (op.op) {
      case 'set':
        if (op.path === 'tags' && Array.isArray(op.value)) {
          for (const v of op.value as unknown[]) {
            if (typeof v === 'string') result.tags.push(v);
          }
        } else {
          result.derived[op.path] = op.value;
        }
        break;
      case 'redact':
        // No-op at the rule layer; redaction is enforced by the worker's
        // PII pass before this point and on persistence.
        break;
      case 'ai.classify':
      case 'ai.extract': {
        const value = await ctx.aiClassify({
          op: op.op === 'ai.classify' ? 'classify' : 'extract',
          schema: op.schema,
          text: message.contentText ?? '',
        });
        result.derived[op.out] = value;
        break;
      }
      case 'ai.summarize': {
        const value = await ctx.aiClassify({
          op: 'summarize',
          schema: { summary: 'string' },
          text: message.contentText ?? '',
        });
        result.derived[op.out] = value;
        break;
      }
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
      }
    }
  }
}

/**
 * Predicate evaluator. The DSL exposes CEL syntax via `{ cel: '...' }` leaves
 * but for the first iteration we ship a minimal expression engine — equality,
 * inequality, regex match, has/size on attachments, and string contains —
 * good enough for the rules used by docs and seed. Full CEL support is a
 * follow-up that swaps `evalCel` for `cel-js` without touching this entry.
 */
function evaluatePredicate(
  pred: Predicate,
  scope: { message: MessageView; derived: Record<string, unknown> },
): boolean {
  if ('cel' in pred) return evalCel(pred.cel, scope);
  if ('all' in pred) return pred.all.every((p) => evaluatePredicate(p, scope));
  if ('any' in pred) return pred.any.some((p) => evaluatePredicate(p, scope));
  return false;
}

const COMPARE_RE = /^(.+?)\s*(==|!=|>=|<=|>|<|matches|contains)\s*(.+)$/;

function evalCel(expr: string, scope: { message: MessageView; derived: Record<string, unknown> }): boolean {
  const trimmed = expr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // has(message.attachments) → true if attachments array non-empty.
  if (/^has\(message\.attachments\)$/.test(trimmed)) {
    return scope.message.attachments.length > 0;
  }
  // message.attachments.size() > N
  const sizeMatch = /^message\.attachments\.size\(\)\s*([<>=!]=?)\s*(\d+)$/.exec(trimmed);
  if (sizeMatch) {
    const op = sizeMatch[1]!;
    const n = Number(sizeMatch[2]);
    return compareNumbers(scope.message.attachments.length, op, n);
  }

  const m = COMPARE_RE.exec(trimmed);
  if (!m) return false;
  const left = resolvePath(m[1]!.trim(), scope);
  const right = parseLiteral(m[3]!.trim(), scope);
  switch (m[2]) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
    case '>=':
    case '<':
    case '<=':
      return compareNumbers(Number(left), m[2]!, Number(right));
    case 'matches':
      if (typeof left !== 'string' || typeof right !== 'string') return false;
      try {
        // CEL-style inline-flag prefix `(?i)` / `(?im)` → JS regex flags.
        const flagMatch = /^\(\?([imsu]+)\)/.exec(right);
        const pattern = flagMatch ? right.slice(flagMatch[0].length) : right;
        const flags = flagMatch ? flagMatch[1]! : '';
        return new RegExp(pattern, flags).test(left);
      } catch {
        return false;
      }
    case 'contains':
      if (typeof left !== 'string' || typeof right !== 'string') return false;
      return left.includes(right);
    default:
      return false;
  }
}

function compareNumbers(a: number, op: string, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (op) {
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return false;
  }
}

function parseLiteral(token: string, scope: { message: MessageView; derived: Record<string, unknown> }): unknown {
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if (token === 'true') return true;
  if (token === 'false') return false;
  return resolvePath(token, scope);
}

function resolvePath(path: string, scope: { message: MessageView; derived: Record<string, unknown> }): unknown {
  const parts = path.split('.');
  const root = parts[0];
  let cur: unknown =
    root === 'message' ? scope.message : root === 'derived' ? scope.derived : undefined;
  for (let i = 1; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  return cur;
}

// Re-export Zod for parsing rule defs at boundaries.
export { z };