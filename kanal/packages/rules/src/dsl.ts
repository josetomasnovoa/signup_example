import { z } from 'zod';

/**
 * Rule DSL — declarative pipeline executed by the worker after a message
 * is persisted. Predicates use CEL syntax. Transforms are named ops from a
 * fixed library. Routing fans out to destinations with optional fallback.
 */

export const PredicateLeaf = z.object({ cel: z.string().min(1) });

export type Predicate = z.infer<typeof PredicateLeaf> | { all: Predicate[] } | { any: Predicate[] };

export const Predicate: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    PredicateLeaf,
    z.object({ all: z.array(Predicate) }),
    z.object({ any: z.array(Predicate) }),
  ]),
);

export const TransformOp = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set'),
    path: z.string(),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal('redact'),
    paths: z.array(z.string()),
  }),
  z.object({
    op: z.literal('ai.classify'),
    /** Canonical model id; if omitted, inbox default is used. */
    modelId: z.string().optional(),
    schema: z.record(z.string()),
    out: z.string(),
  }),
  z.object({
    op: z.literal('ai.extract'),
    modelId: z.string().optional(),
    schema: z.record(z.string()),
    out: z.string(),
  }),
  z.object({
    op: z.literal('ai.summarize'),
    modelId: z.string().optional(),
    maxWords: z.number().int().positive().optional(),
    out: z.string().default('summary'),
  }),
]);
export type TransformOp = z.infer<typeof TransformOp>;

export const FanoutTarget = z.object({
  destination: z.string().min(1),
  with: z.record(z.unknown()).optional(),
});

export const RouteStep = z.object({
  fanout: z.array(FanoutTarget).min(1),
  on_failure: z.enum(['fallback', 'continue', 'stop']).default('fallback'),
});

export const PipelineStep = z.union([
  z.object({
    id: z.string().optional(),
    match: Predicate,
    else: z.enum(['skip', 'stop']).default('skip'),
  }),
  z.object({ transform: z.array(TransformOp) }),
  z.object({ route: RouteStep }),
]);
export type PipelineStep = z.infer<typeof PipelineStep>;

export const RuleDefinition = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  trigger: z.literal('message.received'),
  pipeline: z.array(PipelineStep).min(1),
});
export type RuleDefinition = z.infer<typeof RuleDefinition>;
