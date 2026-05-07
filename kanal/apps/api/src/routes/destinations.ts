import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { NotFoundError, ValidationError } from '@kanal/shared';
import { getDriver } from '@kanal/destinations';

const DestinationKind = z.enum([
  'webhook',
  'notion',
  'drive',
  'slack',
  'discord',
  'github_issue',
  'email_forward',
  'mcp_client',
  'internal',
  'api_passthrough',
]);

const RetryPolicy = z
  .object({
    maxAttempts: z.number().int().min(1).max(20),
    backoff: z.enum(['fixed', 'exponential']),
    baseMs: z.number().int().min(50).max(60_000),
    maxMs: z.number().int().min(50).max(600_000),
  })
  .strict();

const DestinationDto = z.object({
  id: z.string().uuid(),
  inboxId: z.string().uuid(),
  kind: DestinationKind,
  name: z.string(),
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  retryPolicy: RetryPolicy.nullable(),
  createdAt: z.string().datetime(),
});

const CreateDestination = z.object({
  kind: DestinationKind,
  name: z.string().min(1).max(100),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  retryPolicy: RetryPolicy.optional(),
});

const UpdateDestination = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  retryPolicy: RetryPolicy.optional(),
});

const TestBody = z.object({
  payload: z
    .object({
      subject: z.string().nullable().default(null),
      contentText: z.string().nullable().default(null),
      derived: z.record(z.unknown()).default({}),
      tags: z.array(z.string()).default([]),
    })
    .default({ subject: null, contentText: null, derived: {}, tags: [] }),
});

function toDto(row: typeof schema.destination.$inferSelect): z.infer<typeof DestinationDto> {
  return {
    id: row.id,
    inboxId: row.inboxId,
    kind: row.kind,
    name: row.name,
    config: (row.config as Record<string, unknown>) ?? {},
    enabled: row.enabled,
    retryPolicy: (row.retryPolicy as z.infer<typeof RetryPolicy> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertInbox(app: FastifyInstance, tenantId: string, inboxId: string): Promise<void> {
  const exists = await withTenant(app.db, tenantId, (tx) =>
    tx.query.inbox.findFirst({
      where: and(eq(schema.inbox.id, inboxId), eq(schema.inbox.tenantId, tenantId)),
    }),
  );
  if (!exists) throw new NotFoundError('Inbox');
}

export async function registerDestinations(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const InboxParam = z.object({ inboxId: z.string().uuid() });

  typed.get(
    '/v1/inboxes/:inboxId/destinations',
    {
      config: { requireScope: 'destinations:read' },
      schema: {
        params: InboxParam,
        response: { 200: z.object({ destinations: z.array(DestinationDto) }) },
      },
    },
    async (req) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.destination.findMany({ where: eq(schema.destination.inboxId, req.params.inboxId) }),
      );
      return { destinations: rows.map(toDto) };
    },
  );

  typed.post(
    '/v1/inboxes/:inboxId/destinations',
    {
      config: { requireScope: 'destinations:write' },
      schema: { params: InboxParam, body: CreateDestination, response: { 201: DestinationDto } },
    },
    async (req, reply) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      if (!getDriver(req.body.kind)) {
        throw new ValidationError(`No driver registered for destination kind '${req.body.kind}'`);
      }
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.destination)
          .values({
            tenantId: req.tenantId,
            inboxId: req.params.inboxId,
            kind: req.body.kind,
            name: req.body.name,
            config: req.body.config,
            enabled: req.body.enabled,
            retryPolicy: req.body.retryPolicy ?? null,
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return toDto(row);
    },
  );

  typed.patch(
    '/v1/inboxes/:inboxId/destinations/:id',
    {
      config: { requireScope: 'destinations:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        body: UpdateDestination,
        response: { 200: DestinationDto },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const patch: Partial<typeof schema.destination.$inferInsert> = {};
        if (req.body.name !== undefined) patch.name = req.body.name;
        if (req.body.config !== undefined) patch.config = req.body.config;
        if (req.body.enabled !== undefined) patch.enabled = req.body.enabled;
        if (req.body.retryPolicy !== undefined) patch.retryPolicy = req.body.retryPolicy;
        const [r] = await tx
          .update(schema.destination)
          .set(patch)
          .where(
            and(
              eq(schema.destination.id, req.params.id),
              eq(schema.destination.inboxId, req.params.inboxId),
              eq(schema.destination.tenantId, req.tenantId),
            ),
          )
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Destination');
      return toDto(row);
    },
  );

  typed.delete(
    '/v1/inboxes/:inboxId/destinations/:id',
    {
      config: { requireScope: 'destinations:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const ok = await withTenant(app.db, req.tenantId, async (tx) => {
        const res = await tx
          .delete(schema.destination)
          .where(
            and(
              eq(schema.destination.id, req.params.id),
              eq(schema.destination.inboxId, req.params.inboxId),
              eq(schema.destination.tenantId, req.tenantId),
            ),
          )
          .returning({ id: schema.destination.id });
        return res.length > 0;
      });
      if (!ok) throw new NotFoundError('Destination');
      reply.code(204);
      return null;
    },
  );

  typed.post(
    '/v1/inboxes/:inboxId/destinations/:id/test',
    {
      config: { requireScope: 'destinations:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        body: TestBody,
        response: {
          200: z.object({
            status: z.enum(['success', 'failed']),
            errorCode: z.string().optional(),
            errorMessage: z.string().optional(),
            response: z.record(z.unknown()),
          }),
        },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.destination.findFirst({
          where: and(
            eq(schema.destination.id, req.params.id),
            eq(schema.destination.inboxId, req.params.inboxId),
            eq(schema.destination.tenantId, req.tenantId),
          ),
        }),
      );
      if (!row) throw new NotFoundError('Destination');
      const driver = getDriver(row.kind);
      if (!driver) throw new ValidationError(`No driver for kind ${row.kind}`);

      const result = await driver.deliver(
        {
          messageId: '00000000-0000-0000-0000-000000000000',
          inboxId: row.inboxId,
          tenantId: req.tenantId,
          channel: 'api',
          receivedAt: new Date().toISOString(),
          subject: req.body.payload.subject,
          contentText: req.body.payload.contentText,
          contentJson: null,
          sender: null,
          derived: req.body.payload.derived,
          tags: req.body.payload.tags,
        },
        row.config as Record<string, unknown>,
      );
      const out: {
        status: 'success' | 'failed';
        errorCode?: string;
        errorMessage?: string;
        response: Record<string, unknown>;
      } = {
        status: result.status,
        response: result.response as Record<string, unknown>,
      };
      if (result.errorCode !== undefined) out.errorCode = result.errorCode;
      if (result.errorMessage !== undefined) out.errorMessage = result.errorMessage;
      return out;
    },
  );
}