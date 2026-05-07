import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { NotFoundError } from '@kanal/shared';
import { sealSecret } from '@kanal/secrets';

const SecretPurpose = z.enum([
  'byok_anthropic',
  'byok_google',
  'byok_openai',
  'wa_token',
  'notion_token',
  'slack_token',
  'generic_oauth',
  'signing_secret',
]);

const SecretDto = z.object({
  id: z.string().uuid(),
  purpose: SecretPurpose,
  metadata: z.record(z.unknown()).nullable(),
  kmsKeyId: z.string(),
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().nullable(),
});

const CreateSecret = z.object({
  purpose: SecretPurpose,
  /** Plaintext value to encrypt. Never returned by any endpoint. */
  value: z.string().min(1).max(10_000),
  metadata: z.record(z.unknown()).optional(),
});

function toDto(row: typeof schema.encryptedSecret.$inferSelect): z.infer<typeof SecretDto> {
  return {
    id: row.id,
    purpose: row.purpose,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    kmsKeyId: row.kmsKeyId,
    createdAt: row.createdAt.toISOString(),
    rotatedAt: row.rotatedAt ? row.rotatedAt.toISOString() : null,
  };
}

/**
 * BYOK + provider-token secret storage.
 *
 *   POST /v1/secrets — accepts a plaintext, immediately envelope-encrypts
 *     it (random DEK + AES-256-GCM, DEK wrapped by KMS) and stores
 *     ciphertext + wrapped DEK + KMS key id. The plaintext is never logged
 *     or returned. The DTO exposes only metadata + key id.
 *   GET /v1/secrets — lists secrets without ciphertext.
 *   POST /v1/secrets/:id/rotate — re-encrypts an existing secret with a
 *     fresh DEK (provided body has the new plaintext).
 *   DELETE /v1/secrets/:id — soft-deletes by row removal (consider keeping
 *     audit trail in production by flagging instead of deleting).
 */
export async function registerSecrets(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/secrets',
    {
      config: { requireScope: 'admin' },
      schema: { response: { 200: z.object({ secrets: z.array(SecretDto) }) } },
    },
    async (req) => {
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.encryptedSecret.findMany({
          where: eq(schema.encryptedSecret.tenantId, req.tenantId),
          orderBy: desc(schema.encryptedSecret.createdAt),
        }),
      );
      return { secrets: rows.map(toDto) };
    },
  );

  typed.post(
    '/v1/secrets',
    {
      config: { requireScope: 'admin' },
      schema: { body: CreateSecret, response: { 201: SecretDto } },
    },
    async (req, reply) => {
      const sealed = await sealSecret(req.body.value);
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.encryptedSecret)
          .values({
            tenantId: req.tenantId,
            purpose: req.body.purpose,
            ciphertext: sealed.ciphertext,
            dekWrapped: sealed.dekWrapped,
            kmsKeyId: sealed.kmsKeyId,
            metadata: req.body.metadata ?? null,
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return toDto(row);
    },
  );

  typed.post(
    '/v1/secrets/:id/rotate',
    {
      config: { requireScope: 'admin' },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ value: z.string().min(1).max(10_000) }),
        response: { 200: SecretDto },
      },
    },
    async (req) => {
      const sealed = await sealSecret(req.body.value);
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .update(schema.encryptedSecret)
          .set({
            ciphertext: sealed.ciphertext,
            dekWrapped: sealed.dekWrapped,
            kmsKeyId: sealed.kmsKeyId,
            rotatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.encryptedSecret.id, req.params.id),
              eq(schema.encryptedSecret.tenantId, req.tenantId),
            ),
          )
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Secret');
      return toDto(row);
    },
  );

  typed.delete(
    '/v1/secrets/:id',
    {
      config: { requireScope: 'admin' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } },
    },
    async (req, reply) => {
      const ok = await withTenant(app.db, req.tenantId, async (tx) => {
        const res = await tx
          .delete(schema.encryptedSecret)
          .where(
            and(
              eq(schema.encryptedSecret.id, req.params.id),
              eq(schema.encryptedSecret.tenantId, req.tenantId),
            ),
          )
          .returning({ id: schema.encryptedSecret.id });
        return res.length > 0;
      });
      if (!ok) throw new NotFoundError('Secret');
      reply.code(204);
      return null;
    },
  );
}
