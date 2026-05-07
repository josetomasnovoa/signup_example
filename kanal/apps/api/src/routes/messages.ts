import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { InboundMessage } from '@kanal/shared';

const PostMessageBody = InboundMessage.pick({
  inboxId: true,
  channelKind: true,
  sender: true,
  contentText: true,
  contentHtml: true,
  contentJson: true,
  subject: true,
  attachments: true,
  metadata: true,
}).extend({
  inboxSlug: z.string().optional(),
});

export async function registerMessages(app: FastifyInstance): Promise<void> {
  /**
   * Stub endpoint. Full implementation will:
   *  1. Resolve tenant from API key (auth plugin).
   *  2. Look up inbox by id or slug under that tenant.
   *  3. Build a normalized InboundMessage envelope.
   *  4. Enqueue on BullMQ `ingest` queue.
   *  5. Return 202 with message id.
   */
  app.withTypeProvider<ZodTypeProvider>().post(
    '/v1/messages',
    {
      schema: {
        body: PostMessageBody,
        response: {
          202: z.object({ id: z.string().uuid(), status: z.literal('queued') }),
        },
      },
    },
    async (_req, reply) => {
      const id = crypto.randomUUID();
      reply.code(202);
      return { id, status: 'queued' as const };
    },
  );
}
