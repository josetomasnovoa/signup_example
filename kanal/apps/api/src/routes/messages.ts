import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { ChannelKind, NotFoundError } from '@kanal/shared';
import { QUEUE_INGEST } from '../plugins/queue.js';

const MessageDto = z.object({
  id: z.string().uuid(),
  inboxId: z.string().uuid(),
  channelId: z.string().uuid().nullable(),
  externalId: z.string().nullable(),
  direction: z.enum(['inbound', 'outbound']),
  status: z.enum(['received', 'processing', 'processed', 'failed', 'dead']),
  sender: z.record(z.unknown()).nullable(),
  contentText: z.string().nullable(),
  contentHtml: z.string().nullable(),
  contentJson: z.record(z.unknown()).nullable(),
  subject: z.string().nullable(),
  aiSummary: z.string().nullable(),
  aiClassification: z.record(z.unknown()).nullable(),
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});

function msgToDto(row: typeof schema.message.$inferSelect): z.infer<typeof MessageDto> {
  return {
    id: row.id,
    inboxId: row.inboxId,
    channelId: row.channelId,
    externalId: row.externalId,
    direction: row.direction,
    status: row.status,
    sender: (row.sender as Record<string, unknown> | null) ?? null,
    contentText: row.contentText,
    contentHtml: row.contentHtml,
    contentJson: (row.contentJson as Record<string, unknown> | null) ?? null,
    subject: row.subject,
    aiSummary: row.aiSummary,
    aiClassification: (row.aiClassification as Record<string, unknown> | null) ?? null,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
  };
}

const PostMessageBody = z.object({
  inboxId: z.string().uuid().optional(),
  inboxSlug: z.string().min(1).optional(),
  channelKind: ChannelKind.default('api'),
  sender: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  contentText: z.string().optional(),
  contentHtml: z.string().optional(),
  contentJson: z.record(z.unknown()).optional(),
  subject: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerMessages(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /**
   * Ingest a message via direct API. Resolves the inbox under the caller's
   * tenant, finds (or creates) the matching channel row, persists the
   * message in `received` state, and enqueues an `ingest` job for the
   * worker to run the rules+AI+delivery pipeline.
   */
  typed.post(
    '/v1/messages',
    {
      config: { requireScope: 'messages:write' },
      schema: {
        body: PostMessageBody,
        response: {
          202: z.object({ id: z.string().uuid(), status: z.literal('queued') }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body;
      const { tenantId } = req;

      const messageId = await withTenant(app.db, tenantId, async (tx) => {
        const inboxRow = body.inboxId
          ? await tx.query.inbox.findFirst({
              where: and(eq(schema.inbox.id, body.inboxId), eq(schema.inbox.tenantId, tenantId)),
            })
          : body.inboxSlug
            ? await tx.query.inbox.findFirst({
                where: and(
                  eq(schema.inbox.slug, body.inboxSlug),
                  eq(schema.inbox.tenantId, tenantId),
                ),
              })
            : undefined;

        if (!inboxRow) throw new NotFoundError('Inbox');

        const existingChannel = await tx.query.channel.findFirst({
          where: and(
            eq(schema.channel.inboxId, inboxRow.id),
            eq(schema.channel.kind, body.channelKind),
          ),
        });

        const channelId =
          existingChannel?.id ??
          (
            await tx
              .insert(schema.channel)
              .values({
                tenantId,
                inboxId: inboxRow.id,
                kind: body.channelKind,
                config: {},
                enabled: true,
              })
              .returning({ id: schema.channel.id })
          )[0]!.id;

        const [inserted] = await tx
          .insert(schema.message)
          .values({
            tenantId,
            inboxId: inboxRow.id,
            channelId,
            direction: 'inbound',
            status: 'received',
            sender: body.sender ?? null,
            contentText: body.contentText ?? null,
            contentHtml: body.contentHtml ?? null,
            contentJson: body.contentJson ?? null,
            subject: body.subject ?? null,
            metadata: body.metadata ?? {},
          })
          .returning({ id: schema.message.id });

        return inserted!.id;
      });

      await app.ingestQueue.add(
        QUEUE_INGEST,
        { messageId, tenantId },
        { jobId: messageId, removeOnComplete: 1000, removeOnFail: 5000 },
      );

      reply.code(202);
      return { id: messageId, status: 'queued' as const };
    },
  );

  /**
   * Cursor-based pagination over messages in an inbox. The cursor is the
   * received_at timestamp of the last item; pass it back as `?cursor=...`
   * to fetch the next page in descending order.
   */
  typed.get(
    '/v1/inboxes/:inboxId/messages',
    {
      config: { requireScope: 'messages:read' },
      schema: {
        params: z.object({ inboxId: z.string().uuid() }),
        querystring: z.object({
          cursor: z.string().datetime().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: {
          200: z.object({
            messages: z.array(MessageDto),
            nextCursor: z.string().datetime().nullable(),
          }),
        },
      },
    },
    async (req) => {
      const inbox = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.inbox.findFirst({
          where: and(
            eq(schema.inbox.id, req.params.inboxId),
            eq(schema.inbox.tenantId, req.tenantId),
          ),
        }),
      );
      if (!inbox) throw new NotFoundError('Inbox');

      const conds = [eq(schema.message.inboxId, req.params.inboxId)];
      if (req.query.cursor) conds.push(lt(schema.message.receivedAt, new Date(req.query.cursor)));

      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.message.findMany({
          where: and(...conds),
          orderBy: desc(schema.message.receivedAt),
          limit: req.query.limit + 1,
        }),
      );
      const hasMore = rows.length > req.query.limit;
      const page = hasMore ? rows.slice(0, req.query.limit) : rows;
      const last = page[page.length - 1];
      return {
        messages: page.map(msgToDto),
        nextCursor: hasMore && last ? last.receivedAt.toISOString() : null,
      };
    },
  );

  typed.get(
    '/v1/messages/:id',
    {
      config: { requireScope: 'messages:read' },
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: MessageDto } },
    },
    async (req) => {
      const row = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.message.findFirst({
          where: and(
            eq(schema.message.id, req.params.id),
            eq(schema.message.tenantId, req.tenantId),
          ),
        }),
      );
      if (!row) throw new NotFoundError('Message');
      return msgToDto(row);
    },
  );

  const DeliveryDto = z.object({
    id: z.string().uuid(),
    destinationId: z.string().uuid(),
    attemptNo: z.number().int(),
    status: z.enum(['pending', 'success', 'failed', 'dlq']),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    response: z.record(z.unknown()).nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
  });

  typed.get(
    '/v1/messages/:id/deliveries',
    {
      config: { requireScope: 'messages:read' },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ deliveries: z.array(DeliveryDto) }) },
      },
    },
    async (req) => {
      const msg = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.message.findFirst({
          where: and(
            eq(schema.message.id, req.params.id),
            eq(schema.message.tenantId, req.tenantId),
          ),
        }),
      );
      if (!msg) throw new NotFoundError('Message');
      const rows = await withTenant(app.db, req.tenantId, (tx) =>
        tx.query.deliveryAttempt.findMany({
          where: eq(schema.deliveryAttempt.messageId, req.params.id),
          orderBy: asc(schema.deliveryAttempt.startedAt),
        }),
      );
      return {
        deliveries: rows.map((r) => ({
          id: r.id,
          destinationId: r.destinationId,
          attemptNo: r.attemptNo,
          status: r.status,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          response: (r.responseSnapshot as Record<string, unknown> | null) ?? null,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        })),
      };
    },
  );
}
