import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@kanal/observability';
import { isApiKey } from '@kanal/shared';
import { KanalApiClient } from './kanal-api.js';
import { TOOLS, dispatchTool } from './tools/inbox.js';

const logger = createLogger({ service: 'kanal-mcp' });

const KANAL_API_URL = process.env.KANAL_API_URL ?? 'http://localhost:3001';

/**
 * Build an MCP server bound to a specific tenant API key. We construct one
 * per HTTP session (or one for the whole process when bridged via stdio)
 * because the client object captures the bearer token.
 */
function buildServer(apiKey: string): Server {
  const api = new KanalApiClient(KANAL_API_URL, apiKey);
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
    return dispatchTool(api, name, args ?? {});
  });

  return server;
}

/**
 * Start the MCP server in the transport selected by env:
 *   KANAL_MCP_TRANSPORT=stdio (default for Claude Desktop bridging)
 *     reads KANAL_API_KEY from env
 *   KANAL_MCP_TRANSPORT=http  (Streamable HTTP at /mcp)
 *     reads `Authorization: Bearer <api-key>` from each request
 */
export async function startMcp(): Promise<void> {
  const transport = process.env.KANAL_MCP_TRANSPORT ?? 'stdio';
  if (transport === 'stdio') {
    const apiKey = process.env.KANAL_API_KEY;
    if (!apiKey || !isApiKey(apiKey)) {
      throw new Error('KANAL_API_KEY env var with a Kanal api key is required for stdio transport');
    }
    const server = buildServer(apiKey);
    await server.connect(new StdioServerTransport());
    logger.info('mcp-server connected on stdio');
    return;
  }

  if (transport === 'http') {
    const port = Number(process.env.MCP_PORT ?? 3002);
    const app = express();
    app.use(express.json({ limit: '4mb' }));

    app.post('/mcp', async (req, res) => {
      const auth = req.headers['authorization'];
      const m = typeof auth === 'string' && /^Bearer\s+(\S+)$/i.exec(auth);
      const apiKey = m ? m[1] : null;
      if (!apiKey || !isApiKey(apiKey)) {
        res.status(401).json({ error: 'missing or invalid Authorization' });
        return;
      }
      try {
        const server = buildServer(apiKey);
        // Stateless mode: a brand new transport+server per request so we can
        // serve any number of unrelated clients without holding session
        // state. The undefined cast bypasses exactOptionalPropertyTypes;
        // the SDK explicitly recognises undefined as the stateless signal.
        const sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined as unknown as () => string,
        });
        res.on('close', () => {
          void sessionTransport.close();
          void server.close();
        });
        await server.connect(sessionTransport as unknown as Transport);
        await sessionTransport.handleRequest(req, res, req.body);
      } catch (err) {
        logger.error({ err }, 'mcp:http error');
        if (!res.headersSent) res.status(500).json({ error: 'internal' });
      }
    });

    app.listen(port, () => logger.info(`mcp-server listening on :${port}`));
    return;
  }

  throw new Error(`Unsupported KANAL_MCP_TRANSPORT: ${transport}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startMcp().catch((err) => {
    logger.error({ err }, 'mcp-server failed to start');
    process.exit(1);
  });
}
