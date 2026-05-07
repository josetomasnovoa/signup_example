import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { DeliveryPayload, DeliveryResult, DestinationDriver } from './driver.js';

/**
 * MCP-client destination. The system acts as an MCP CLIENT, opening a
 * Streamable HTTP connection to an external MCP server and invoking a
 * configured tool with the message payload as arguments.
 *
 * config.url        — MCP server URL (Streamable HTTP endpoint)
 * config.tool       — tool name on the remote server, e.g. `kb.upsert_note`
 * config.bearer     — optional bearer token sent as `Authorization` header
 * config.headers    — extra headers to send (do not put secrets here)
 * config.argsTemplate — JSON template, with `{{message.*}}`, `{{derived.*}}`,
 *                      `{{tags}}` placeholders. Defaults to a sensible shape.
 */
export const McpClientConfig = z.object({
  url: z.string().url(),
  tool: z.string().min(1),
  bearer: z.string().optional(),
  headers: z.record(z.string()).optional(),
  argsTemplate: z.unknown().optional(),
  timeoutMs: z.number().int().positive().max(60_000).default(15_000),
});
export type McpClientConfig = z.infer<typeof McpClientConfig>;

const DEFAULT_TEMPLATE = {
  messageId: '{{message.id}}',
  channel: '{{message.channel}}',
  subject: '{{message.subject}}',
  contentText: '{{message.contentText}}',
  derived: '{{derived}}',
  tags: '{{tags}}',
};

/**
 * Resolve `{{path.with.dots}}` placeholders against the delivery payload.
 * Whole-value placeholders (a string that is exactly one `{{...}}`) are
 * replaced with the resolved value, preserving its type. Mixed strings get
 * stringification.
 */
function renderArgs(template: unknown, payload: DeliveryPayload): unknown {
  if (typeof template === 'string') {
    const whole = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(template);
    if (whole) return resolve(whole[1]!, payload);
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, p: string) => {
      const v = resolve(p, payload);
      return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(template)) return template.map((t) => renderArgs(t, payload));
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) out[k] = renderArgs(v, payload);
    return out;
  }
  return template;
}

function resolve(path: string, payload: DeliveryPayload): unknown {
  const parts = path.split('.');
  const root = parts[0];
  let cur: unknown =
    root === 'message'
      ? {
          id: payload.messageId,
          channel: payload.channel,
          subject: payload.subject,
          contentText: payload.contentText,
          contentJson: payload.contentJson,
          sender: payload.sender,
          receivedAt: payload.receivedAt,
        }
      : root === 'derived'
        ? payload.derived
        : root === 'tags'
          ? payload.tags
          : root === 'tenantId'
            ? payload.tenantId
            : root === 'inboxId'
              ? payload.inboxId
              : undefined;
  for (let i = 1; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  return cur;
}

class McpClientDriver implements DestinationDriver {
  readonly kind = 'mcp_client';

  async deliver(payload: DeliveryPayload, raw: Record<string, unknown>): Promise<DeliveryResult> {
    const cfg = McpClientConfig.parse(raw);
    const args = renderArgs(cfg.argsTemplate ?? DEFAULT_TEMPLATE, payload);

    const headers: Record<string, string> = {
      ...(cfg.bearer ? { authorization: `Bearer ${cfg.bearer}` } : {}),
      ...(cfg.headers ?? {}),
    };

    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers },
    });
    const client = new Client(
      { name: 'kanal-mcp-client', version: '0.0.0' },
      { capabilities: {} },
    );

    const timeoutPromise = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('timeout')), cfg.timeoutMs),
    );

    try {
      await Promise.race([client.connect(transport as unknown as Transport), timeoutPromise]);
      const result = await Promise.race([
        client.callTool({
          name: cfg.tool,
          arguments: (args ?? {}) as Record<string, unknown>,
        }),
        timeoutPromise,
      ]);
      const isError = (result as { isError?: boolean }).isError === true;
      return {
        status: isError ? 'failed' : 'success',
        ...(isError
          ? {
              errorCode: 'mcp_tool_error',
              errorMessage: extractText(result).slice(0, 500) || 'tool returned isError',
            }
          : {}),
        request: { url: cfg.url, headers: redactHeaders(headers), body: { tool: cfg.tool, arguments: args } },
        response: { body: result as Record<string, unknown> },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        errorCode: msg === 'timeout' ? 'timeout' : 'mcp_error',
        errorMessage: msg,
        request: { url: cfg.url, headers: redactHeaders(headers), body: { tool: cfg.tool, arguments: args } },
        response: {},
      };
    } finally {
      try {
        await client.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

function extractText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k.toLowerCase() === 'authorization' ? '[REDACTED]' : v;
  }
  return out;
}

export const mcpClientDriver: DestinationDriver = new McpClientDriver();
