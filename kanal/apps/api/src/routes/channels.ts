import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { ChannelKind, NotFoundError } from '@kanal/shared';

const ChannelDto = z.object({
  id: z.string().uuid(),
  inboxId: z.string().uuid(),
  kind: ChannelKind,
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
});

const CreateChannel = z.object({
  kind: ChannelKind,
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const UpdateChannel = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

function toDto(row: typeof schema.channel.$inferSelect): z.infer<typeof ChannelDto> {
  return {
    id: row.id,
    inboxId: row.inboxId,
    kind: row.kind,
    config: (row.config as Record<string, unknown>) ?? {},
    enabled: row.enabled,
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

export async function registerChannels(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const InboxParam = z.object({ inboxId: z.string().uuid() });

  typed.get(
    '/v1/inboxes/:inboxId/channels',
    {
      config: { requireScope: 'inboxes:read' },
      schema: {
        params: InboxParam,
        response: { 200: z.object({ channels: z.array(ChannelDto) }) },
      },
    },
    async (req) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.channel.findMany({ where: eq(schema.channel.inboxId, req.params.inboxId) }),
      );
      return { channels: rows.map(toDto) };
    },
  );

  typed.post(
    '/v1/inboxes/:inboxId/channels',
    {
      config: { requireScope: 'inboxes:write' },
      schema: { params: InboxParam, body: CreateChannel, response: { 201: ChannelDto } },
    },
    async (req, reply) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.channel)
          .values({
            tenantId: req.tenantId,
            inboxId: req.params.inboxId,
            kind: req.body.kind,
            config: req.body.config,
            enabled: req.body.enabled,
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return toDto(row);
    },
  );

  typed.patch(
    '/v1/inboxes/:inboxId/channels/:id',
    {
      config: { requireScope: 'inboxes:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        body: UpdateChannel,
        response: { 200: ChannelDto },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const patch: Partial<typeof schema.channel.$inferInsert> = {};
        if (req.body.config !== undefined) patch.config = req.body.config;
        if (req.body.enabled !== undefined) patch.enabled = req.body.enabled;
        const [r] = await tx
          .update(schema.channel)
          .set(patch)
          .where(
            and(
              eq(schema.channel.id, req.params.id),
              eq(schema.channel.inboxId, req.params.inboxId),
              eq(schema.channel.tenantId, req.tenantId),
            ),
          )
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Channel');
      return toDto(row);
    },
  );

  typed.delete(
    '/v1/inboxes/:inboxId/channels/:id',
    {
      config: { requireScope: 'inboxes:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const ok = await withTenant(app.db, req.tenantId, async (tx) => {
        const res = await tx
          .delete(schema.channel)
          .where(
            and(
              eq(schema.channel.id, req.params.id),
              eq(schema.channel.inboxId, req.params.inboxId),
              eq(schema.channel.tenantId, req.tenantId),
            ),
          )
          .returning({ id: schema.channel.id });
        return res.length > 0;
      });
      if (!ok) throw new NotFoundError('Channel');
      reply.code(204);
      return null;
    },
  );
}