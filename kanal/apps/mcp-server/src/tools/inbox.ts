import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tools exposed by Kanal. Each tool will be backed by a call into the
 * internal API. For now we register stubs so external MCP clients can
 * discover the surface; real implementations land alongside the API
 * endpoints they wrap.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'inbox.list',
    description: 'List inboxes accessible to the caller.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'inbox.get',
    description: 'Fetch a single inbox by id or slug.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, slug: { type: 'string' } },
    },
  },
  {
    name: 'inbox.send',
    description: 'Send a message to an inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        inboxId: { type: 'string' },
        text: { type: 'string' },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              filename: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
        },
      },
      required: ['inboxId', 'text'],
    },
  },
  {
    name: 'inbox.list_messages',
    description: 'Paginated list of messages in an inbox.',
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
    name: 'inbox.search',
    description: 'Full-text + semantic search across messages.',
    inputSchema: {
      type: 'object',
      properties: { inboxId: { type: 'string' }, query: { type: 'string' } },
      required: ['query'],
    },
  },
];

export async function dispatchTool(
  name: string,
  _args: Record<string, unknown>,
): Promise<CallToolResult> {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: `Tool ${name} not yet implemented in this skeleton. See packages/sdk for the wiring plan.`,
      },
    ],
  };
}
