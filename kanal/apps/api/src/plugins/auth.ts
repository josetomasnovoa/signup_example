import fp from 'fastify-plugin';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@kanal/db';
import {
  ForbiddenError,
  UnauthorizedError,
  hashApiKey,
  isApiKey,
  keyPrefix,
  safeHashEqual,
  type Scope,
  hasScope,
} from '@kanal/shared';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    apiKeyId: string;
    scopes: readonly Scope[];
  }
  interface FastifyContextConfig {
    /** Skip API-key auth for this route (e.g. /health, public docs). */
    skipAuth?: boolean;
    /** Required scope (or scopes — any of) for this route. */
    requireScope?: Scope | readonly Scope[];
  }
}

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/**
 * API-key auth: extracts `Authorization: Bearer kn_live_…`, looks up the
 * row by `keyPrefix`, verifies a constant-time hash compare, checks that
 * the key isn't revoked or expired, and decorates the request with the
 * tenant id, key id and scopes.
 *
 * Routes can opt out via `config.skipAuth: true`. They can require a scope
 * via `config.requireScope`. The 'admin' scope satisfies any scope check.
 */
export const authPlugin = fp(
  async (app) => {
    app.addHook('preHandler', async (req) => {
      const cfg = (req.routeOptions.config ?? {}) as {
        skipAuth?: boolean;
        requireScope?: Scope | readonly Scope[];
      };
      if (cfg.skipAuth) return;

      const header = req.headers['authorization'];
      const value = Array.isArray(header) ? header[0] : header;
      const m = value && BEARER_RE.exec(value);
      const token = m?.[1];
      if (!token || !isApiKey(token)) {
        throw new UnauthorizedError('missing or malformed bearer token');
      }

      const prefix = keyPrefix(token);
      const candidate = await app.db.query.apiKey.findFirst({
        where: and(eq(schema.apiKey.keyPrefix, prefix), isNull(schema.apiKey.revokedAt)),
      });
      if (!candidate) throw new UnauthorizedError('invalid api key');
      if (!safeHashEqual(candidate.keyHash, hashApiKey(token))) {
        throw new UnauthorizedError('invalid api key');
      }
      if (candidate.expiresAt && candidate.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedError('api key expired');
      }

      req.tenantId = candidate.tenantId;
      req.apiKeyId = candidate.id;
      req.scopes = candidate.scopes as readonly Scope[];

      // Best-effort lastUsedAt update (fire and forget; not blocking).
      void app.db
        .update(schema.apiKey)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiKey.id, candidate.id));

      const required = cfg.requireScope;
      if (required) {
        const list = Array.isArray(required) ? required : [required];
        const granted = req.scopes;
        if (!list.some((s) => hasScope(granted, s))) {
          throw new ForbiddenError(`missing required scope: ${list.join(', ')}`);
        }
      }
    });
  },
  { name: 'kanal-auth' },
);