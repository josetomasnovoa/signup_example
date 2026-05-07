import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@kanal/observability';
import { TOOLS, dispatchTool } from './tools/inbox.js';

const logger = createLogger({ service: 'kanal-mcp' });

export function buildMcpServer(): Server {
  const server = new Server(
    { name: 'kanal', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    return dispatchTool(name, args ?? {});
  });

  return server;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  server
    .connect(transport)
    .then(() => logger.info('mcp-server connected on stdio'))
    .catch((err) => {
      logger.error({ err }, 'mcp-server failed to start');
      process.exit(1);
    });
}
