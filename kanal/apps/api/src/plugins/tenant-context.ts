import fp from 'fastify-plugin';
import { UnauthorizedError } from '@kanal/shared';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Provisional tenant resolver. Reads `x-tenant-id` from the request header.
 * To be replaced by the API-key auth plugin which derives tenant from the
 * key's `tenant_id` column. Routes can opt out via `config.skipTenant: true`.
 */
export const tenantContextPlugin = fp(
  async (app) => {
    app.addHook('preHandler', async (req) => {
      const cfg = (req.routeOptions.config ?? {}) as { skipTenant?: boolean };
      if (cfg.skipTenant) return;
      const header = req.headers['x-tenant-id'];
      const value = Array.isArray(header) ? header[0] : header;
      if (!value || !UUID_RE.test(value)) {
        throw new UnauthorizedError('missing or invalid x-tenant-id (provisional auth)');
      }
      req.tenantId = value;
    });
  },
  { name: 'kanal-tenant-context' },
);
