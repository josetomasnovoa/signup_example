import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import {
  generateApiKey,
  hashApiKey,
  keyPrefix,
  NotFoundError,
  SCOPES,
  type Scope,
} from '@kanal/shared';

const ScopeEnum = z.enum(SCOPES);

const ApiKeyDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(ScopeEnum),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const CreateApiKey = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(ScopeEnum).default([...SCOPES]),
  env: z.enum(['live', 'test']).default('live'),
  expiresAt: z.string().datetime().optional(),
});

function toDto(row: typeof schema.apiKey.$inferSelect): z.infer<typeof ApiKeyDto> {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: (row.scopes as Scope[]) ?? [],
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerApiKeys(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/api-keys',
    {
      config: { requireScope: 'admin' },
      schema: { response: { 200: z.object({ apiKeys: z.array(ApiKeyDto) }) } },
    },
    async (req) => {
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.apiKey.findMany({
          where: eq(schema.apiKey.tenantId, req.tenantId),
          orderBy: desc(schema.apiKey.createdAt),
        }),
      );
      return { apiKeys: rows.map(toDto) };
    },
  );

  /**
   * Mint a new API key. The plaintext is returned exactly once and never
   * stored. Subsequent reads expose only `keyPrefix`. Rotate by minting a
   * new key and revoking the old one.
   */
  typed.post(
    '/v1/api-keys',
    {
      config: { requireScope: 'admin' },
      schema: {
        body: CreateApiKey,
        response: { 201: ApiKeyDto.extend({ apiKey: z.string() }) },
      },
    },
    async (req, reply) => {
      const apiKey = generateApiKey(req.body.env);
      const prefix = keyPrefix(apiKey);
      const hash = hashApiKey(apiKey);
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.apiKey)
          .values({
            tenantId: req.tenantId,
            name: req.body.name,
            keyPrefix: prefix,
            keyHash: hash,
            scopes: req.body.scopes as unknown as string[],
            createdBy: null,
            ...(req.body.expiresAt ? { expiresAt: new Date(req.body.expiresAt) } : {}),
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return { ...toDto(row), apiKey };
    },
  );

  typed.delete(
    '/v1/api-keys/:id',
    {
      config: { requireScope: 'admin' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: ApiKeyDto } },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .update(schema.apiKey)
          .set({ revokedAt: new Date() })
          .where(and(eq(schema.apiKey.id, req.params.id), eq(schema.apiKey.tenantId, req.tenantId)))
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('ApiKey');
      return toDto(row);
    },
  );
}