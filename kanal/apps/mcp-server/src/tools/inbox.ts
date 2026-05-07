import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { KanalApiClient } from '../kanal-api.js';

/**
 * MCP tools backed by calls to the internal Kanal REST API. Authentication
 * flows through: the MCP transport carries an API key, the server builds a
 * KanalApiClient with that key, and every tool dispatch forwards it. There
 * is no elevation — the API enforces scopes per route exactly as it would
 * for direct REST callers.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'inbox.list',
    description: 'List inboxes accessible to the caller.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'inbox.get',
    description: 'Fetch a single inbox by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Inbox UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'inbox.send',
    description: 'Send a text message to an inbox by id or slug.',
    inputSchema: {
      type: 'object',
      properties: {
        inboxId: { type: 'string' },
        inboxSlug: { type: 'string' },
        text: { type: 'string', description: 'Message body' },
        subject: { type: 'string' },
        senderName: { type: 'string' },
        senderEmail: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'inbox.list_messages',
    description: 'List recent messages in an inbox (descending by received_at).',
    inputSchema: {
      type: 'object',
      properties: {
        inboxId: { type: 'string' },
        cursor: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['inboxId'],
    },
  },
  {
    name: 'inbox.get_message',
    description: 'Fetch a single message by id, including AI summary/classification.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'inbox.list_rules',
    description: 'List rules configured on an inbox.',
    inputSchema: {
      type: 'object',
      properties: { inboxId: { type: 'string' } },
      required: ['inboxId'],
    },
  },
  {
    name: 'inbox.create_rule',
    description: 'Create a new rule on an inbox using the Kanal DSL.',
    inputSchema: {
      type: 'object',
      properties: {
        inboxId: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        priority: { type: 'number' },
        definition: { type: 'object', description: 'Rule definition (DSL)' },
      },
      required: ['inboxId', 'name', 'definition'],
    },
  },
];

function ok(value: unknown): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

function fail(msg: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: msg }] };
}

export async function dispatchTool(
  api: KanalApiClient,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case 'inbox.list':
        return ok(await api.listInboxes());
      case 'inbox.get':
        return ok(await api.getInbox(String(args.id)));
      case 'inbox.send': {
        const body: Parameters<KanalApiClient['sendMessage']>[0] = {};
        if (args.text != null) body.contentText = String(args.text);
        if (args.inboxId) body.inboxId = String(args.inboxId);
        if (args.inboxSlug) body.inboxSlug = String(args.inboxSlug);
        if (args.subject) body.subject = String(args.subject);
        if (args.senderName || args.senderEmail) {
          body.sender = {};
          if (args.senderName) body.sender.name = String(args.senderName);
          if (args.senderEmail) body.sender.email = String(args.senderEmail);
        }
        return ok(await api.sendMessage(body));
      }
      case 'inbox.list_messages':
        return ok(
          await api.listMessages(
            String(args.inboxId),
            args.cursor ? String(args.cursor) : undefined,
            typeof args.limit === 'number' ? args.limit : undefined,
          ),
        );
      case 'inbox.get_message':
        return ok(await api.getMessage(String(args.id)));
      case 'inbox.list_rules':
        return ok(await api.listRules(String(args.inboxId)));
      case 'inbox.create_rule':
        return ok(
          await api.createRule(String(args.inboxId), {
            name: String(args.name),
            enabled: typeof args.enabled === 'boolean' ? args.enabled : true,
            priority: typeof args.priority === 'number' ? args.priority : 0,
            definition: args.definition as Record<string, unknown>,
          }),
        );
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg);
  }
}
