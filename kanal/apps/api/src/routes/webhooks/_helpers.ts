import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema, withTenant } from '@kanal/db';
import { ChannelKind, type Sender } from '@kanal/shared';
import { QUEUE_INGEST } from '../../plugins/queue.js';

export interface PersistInbound {
  tenantId: string;
  channelId: string;
  inboxId: string;
  externalId?: string;
  sender: Sender | null;
  contentText: string | null;
  contentHtml?: string | null;
  contentJson?: Record<string, unknown> | null;
  subject?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Insert a message in `received` state and enqueue an ingest job. Used by
 * provider webhook handlers (WhatsApp, Postmark, ...) after they validate
 * the request and resolve the channel to a tenant + inbox.
 *
 * Idempotent on `(tenant_id, channel_id, external_id)`: if the same provider
 * id arrives twice we re-use the existing message id and don't double-queue.
 */
export async function persistAndEnqueue(
  app: FastifyInstance,
  input: PersistInbound,
): Promise<{ messageId: string; duplicate: boolean }> {
  const messageId = await withTenant(app.db, input.tenantId, async (tx) => {
    if (input.externalId) {
      const existing = await tx.query.message.findFirst({
        where: and(
          eq(schema.message.tenantId, input.tenantId),
          eq(schema.message.channelId, input.channelId),
          eq(schema.message.externalId, input.externalId),
        ),
      });
      if (existing) return { id: existing.id, duplicate: true };
    }
    const [r] = await tx
      .insert(schema.message)
      .values({
        tenantId: input.tenantId,
        inboxId: input.inboxId,
        channelId: input.channelId,
        externalId: input.externalId ?? null,
        direction: 'inbound',
        status: 'received',
        sender: input.sender,
        contentText: input.contentText,
        contentHtml: input.contentHtml ?? null,
        contentJson: input.contentJson ?? null,
        subject: input.subject ?? null,
        metadata: input.metadata ?? {},
        headers: input.headers ?? {},
      })
      .returning({ id: schema.message.id });
    return { id: r!.id, duplicate: false };
  });
  if (!messageId.duplicate) {
    await app.ingestQueue.add(
      QUEUE_INGEST,
      { messageId: messageId.id, tenantId: input.tenantId },
      { jobId: messageId.id, removeOnComplete: 1000, removeOnFail: 5000 },
    );
  }
  return { messageId: messageId.id, duplicate: messageId.duplicate };
}

/**
 * Look up the channel matching a provider identifier. The match key is
 * stored in the channel's `config` jsonb (e.g. WhatsApp uses
 * `config.phoneNumberId`, Postmark uses `config.alias`).
 *
 * The first row that matches kind + key wins. Returns null when no channel
 * is configured for that identifier on any tenant — the webhook handler
 * should respond 200 anyway to avoid retry storms from the provider.
 */
export async function findChannelByConfig(
  app: FastifyInstance,
  kind: typeof ChannelKind._type,
  configKey: string,
  configValue: string,
): Promise<typeof schema.channel.$inferSelect | null> {
  const rows = await app.db
    .select()
    .from(schema.channel)
    .where(
      and(
        eq(schema.channel.kind, kind),
        eq(schema.channel.enabled, true),
        sql`${schema.channel.config}->>${configKey} = ${configValue}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}