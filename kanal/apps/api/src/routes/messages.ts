import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq, and } from 'drizzle-orm';
import { schema, withTenant } from '@kanal/db';
import { ChannelKind, NotFoundError } from '@kanal/shared';
import { QUEUE_INGEST } from '../plugins/queue.js';

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
}
