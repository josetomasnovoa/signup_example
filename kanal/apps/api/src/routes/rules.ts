import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, asc, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { NotFoundError } from '@kanal/shared';
import { RuleDefinition, executeRule, type MessageView } from '@kanal/rules';

const RuleDto = z.object({
  id: z.string().uuid(),
  inboxId: z.string().uuid(),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  definition: z.record(z.unknown()),
  updatedAt: z.string().datetime(),
});

const CreateRule = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-1000).max(1000).default(0),
  definition: RuleDefinition,
});

const UpdateRule = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  definition: RuleDefinition.optional(),
});

const DryRunBody = z.object({
  message: z.object({
    channel: z.enum(['whatsapp', 'email', 'api', 'web', 'mcp']),
    subject: z.string().nullable().default(null),
    contentText: z.string().nullable().default(null),
    sender: z
      .object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() })
      .nullable()
      .default(null),
    metadata: z.record(z.unknown()).default({}),
    attachments: z
      .array(
        z.object({
          filename: z.string(),
          mimeType: z.string(),
          sizeBytes: z.number().int().nonnegative(),
        }),
      )
      .default([]),
  }),
});

function toDto(row: typeof schema.rule.$inferSelect): z.infer<typeof RuleDto> {
  return {
    id: row.id,
    inboxId: row.inboxId,
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    definition: row.definition as Record<string, unknown>,
    updatedAt: row.updatedAt.toISOString(),
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

export async function registerRules(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const InboxParam = z.object({ inboxId: z.string().uuid() });

  typed.get(
    '/v1/inboxes/:inboxId/rules',
    {
      config: { requireScope: 'rules:read' },
      schema: { params: InboxParam, response: { 200: z.object({ rules: z.array(RuleDto) }) } },
    },
    async (req) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.rule.findMany({
          where: eq(schema.rule.inboxId, req.params.inboxId),
          orderBy: asc(schema.rule.priority),
        }),
      );
      return { rules: rows.map(toDto) };
    },
  );

  typed.post(
    '/v1/inboxes/:inboxId/rules',
    {
      config: { requireScope: 'rules:write' },
      schema: { params: InboxParam, body: CreateRule, response: { 201: RuleDto } },
    },
    async (req, reply) => {
      await assertInbox(app, req.tenantId, req.params.inboxId);
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.rule)
          .values({
            tenantId: req.tenantId,
            inboxId: req.params.inboxId,
            name: req.body.name,
            enabled: req.body.enabled,
            priority: req.body.priority,
            definition: req.body.definition,
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return toDto(row);
    },
  );

  typed.patch(
    '/v1/inboxes/:inboxId/rules/:id',
    {
      config: { requireScope: 'rules:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        body: UpdateRule,
        response: { 200: RuleDto },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const patch: Partial<typeof schema.rule.$inferInsert> = { updatedAt: new Date() };
        if (req.body.name !== undefined) patch.name = req.body.name;
        if (req.body.enabled !== undefined) patch.enabled = req.body.enabled;
        if (req.body.priority !== undefined) patch.priority = req.body.priority;
        if (req.body.definition !== undefined) patch.definition = req.body.definition;
        const [r] = await tx
          .update(schema.rule)
          .set(patch)
          .where(
            and(
              eq(schema.rule.id, req.params.id),
              eq(schema.rule.inboxId, req.params.inboxId),
              eq(schema.rule.tenantId, req.tenantId),
            ),
          )
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Rule');
      return toDto(row);
    },
  );

  typed.delete(
    '/v1/inboxes/:inboxId/rules/:id',
    {
      config: { requireScope: 'rules:write' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const ok = await withTenant(app.db, req.tenantId, async (tx) => {
        const res = await tx
          .delete(schema.rule)
          .where(
            and(
              eq(schema.rule.id, req.params.id),
              eq(schema.rule.inboxId, req.params.inboxId),
              eq(schema.rule.tenantId, req.tenantId),
            ),
          )
          .returning({ id: schema.rule.id });
        return res.length > 0;
      });
      if (!ok) throw new NotFoundError('Rule');
      reply.code(204);
      return null;
    },
  );

  /**
   * Dry-run: executes the rule definition against a sample message, with
   * AI calls stubbed to deterministic placeholder values (no provider call,
   * no metering). Returns the matched flag, derived values, computed tags
   * and fan-out plan, so the UI can preview a rule before saving.
   */
  typed.post(
    '/v1/inboxes/:inboxId/rules/:id/dry-run',
    {
      config: { requireScope: 'rules:read' },
      schema: {
        params: InboxParam.extend({ id: z.string().uuid() }),
        body: DryRunBody,
        response: {
          200: z.object({
            matched: z.boolean(),
            derived: z.record(z.unknown()),
            tags: z.array(z.string()),
            fanout: z.array(
              z.object({ destination: z.string(), with: z.record(z.unknown()).optional() }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.rule.findFirst({
          where: and(
            eq(schema.rule.id, req.params.id),
            eq(schema.rule.inboxId, req.params.inboxId),
            eq(schema.rule.tenantId, req.tenantId),
          ),
        }),
      );
      if (!row) throw new NotFoundError('Rule');

      const view: MessageView = {
        id: '00000000-0000-0000-0000-000000000000',
        channel: req.body.message.channel,
        subject: req.body.message.subject,
        contentText: req.body.message.contentText,
        sender: req.body.message.sender,
        metadata: req.body.message.metadata,
        attachments: req.body.message.attachments,
      };
      const res = await executeRule(row.definition, view, {
        now: () => new Date(),
        aiClassify: async ({ schema: s }) => {
          const out: Record<string, unknown> = {};
          for (const [k] of Object.entries(s)) out[k] = `dry_run_${k}`;
          return out;
        },
      });
      return {
        matched: res.matched,
        derived: res.derived,
        tags: res.tags,
        fanout: res.fanout,
      };
    },
  );
}