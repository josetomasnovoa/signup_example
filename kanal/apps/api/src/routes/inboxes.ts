import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { NotFoundError } from '@kanal/shared';

const InboxAiConfig = z.object({
  modelId: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  byokSecretId: z.string().uuid().optional(),
});

const InboxDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  timezone: z.string(),
  aiEnabled: z.boolean(),
  aiConfig: InboxAiConfig.nullable(),
  retentionDays: z.number().int(),
  redactPii: z.boolean(),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});

const CreateInbox = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase alphanumeric with dashes'),
  description: z.string().max(500).optional(),
  language: z.string().default('en'),
  timezone: z.string().default('UTC'),
  aiEnabled: z.boolean().default(false),
  aiConfig: InboxAiConfig.optional(),
  retentionDays: z.number().int().min(1).max(3650).default(90),
  redactPii: z.boolean().default(false),
});

const UpdateInbox = CreateInbox.partial().omit({ slug: true });

function toDto(row: typeof schema.inbox.$inferSelect): z.infer<typeof InboxDto> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    language: row.language,
    timezone: row.timezone,
    aiEnabled: row.aiEnabled,
    aiConfig: row.aiConfig as z.infer<typeof InboxAiConfig> | null,
    retentionDays: row.retentionDays,
    redactPii: row.redactPii,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export async function registerInboxes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/inboxes',
    {
      config: { requireScope: 'inboxes:read' },
      schema: { response: { 200: z.object({ inboxes: z.array(InboxDto) }) } },
    },
    async (req) => {
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.inbox.findMany({
          where: eq(schema.inbox.tenantId, req.tenantId),
          orderBy: desc(schema.inbox.createdAt),
        }),
      );
      return { inboxes: rows.map(toDto) };
    },
  );

  typed.post(
    '/v1/inboxes',
    {
      config: { requireScope: 'inboxes:write' },
      schema: { body: CreateInbox, response: { 201: InboxDto } },
    },
    async (req, reply) => {
      const body = req.body;
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .insert(schema.inbox)
          .values({
            tenantId: req.tenantId,
            name: body.name,
            slug: body.slug,
            description: body.description ?? null,
            language: body.language,
            timezone: body.timezone,
            aiEnabled: body.aiEnabled,
            aiConfig: body.aiConfig ?? null,
            retentionDays: body.retentionDays,
            redactPii: body.redactPii,
          })
          .returning();
        return r!;
      });
      reply.code(201);
      return toDto(row);
    },
  );

  typed.get(
    '/v1/inboxes/:id',
    {
      config: { requireScope: 'inboxes:read' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: InboxDto } },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.inbox.findFirst({
          where: and(eq(schema.inbox.id, req.params.id), eq(schema.inbox.tenantId, req.tenantId)),
        }),
      );
      if (!row) throw new NotFoundError('Inbox');
      return toDto(row);
    },
  );

  typed.patch(
    '/v1/inboxes/:id',
    {
      config: { requireScope: 'inboxes:write' },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: UpdateInbox,
        response: { 200: InboxDto },
      },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const patch: Partial<typeof schema.inbox.$inferInsert> = {};
        if (req.body.name !== undefined) patch.name = req.body.name;
        if (req.body.description !== undefined) patch.description = req.body.description;
        if (req.body.language !== undefined) patch.language = req.body.language;
        if (req.body.timezone !== undefined) patch.timezone = req.body.timezone;
        if (req.body.aiEnabled !== undefined) patch.aiEnabled = req.body.aiEnabled;
        if (req.body.aiConfig !== undefined) patch.aiConfig = req.body.aiConfig;
        if (req.body.retentionDays !== undefined) patch.retentionDays = req.body.retentionDays;
        if (req.body.redactPii !== undefined) patch.redactPii = req.body.redactPii;
        const [r] = await tx
          .update(schema.inbox)
          .set(patch)
          .where(and(eq(schema.inbox.id, req.params.id), eq(schema.inbox.tenantId, req.tenantId)))
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Inbox');
      return toDto(row);
    },
  );

  typed.post(
    '/v1/inboxes/:id/archive',
    {
      config: { requireScope: 'inboxes:write' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: InboxDto } },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, async (tx) => {
        const [r] = await tx
          .update(schema.inbox)
          .set({ archivedAt: new Date() })
          .where(and(eq(schema.inbox.id, req.params.id), eq(schema.inbox.tenantId, req.tenantId)))
          .returning();
        return r;
      });
      if (!row) throw new NotFoundError('Inbox');
      return toDto(row);
    },
  );

  typed.delete(
    '/v1/inboxes/:id',
    {
      config: { requireScope: 'inboxes:write' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } },
    },
    async (req, reply) => {
      const deleted = await withTenant(app.db, req.tenantId, async (tx) => {
        const res = await tx
          .delete(schema.inbox)
          .where(and(eq(schema.inbox.id, req.params.id), eq(schema.inbox.tenantId, req.tenantId)))
          .returning({ id: schema.inbox.id });
        return res.length > 0;
      });
      if (!deleted) throw new NotFoundError('Inbox');
      reply.code(204);
      return null;
    },
  );
}