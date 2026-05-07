import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
// Importing the package index also pulls anthropic/google/mock modules,
// each of which calls registerProvider() at import time.
import { buildUsageRecord, providerForModel } from '@kanal/ai';
import { createDb, schema, withTenant } from '@kanal/db';
import { getDriver } from '@kanal/destinations';
import { createLogger } from '@kanal/observability';
import { executeRule, type MessageView, type RuleContext } from '@kanal/rules';

const logger = createLogger({ service: 'kanal-worker' });

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kanal:kanal@localhost:5432/kanal';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const { db, sql } = createDb({ url: databaseUrl });
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const IngestJob = z.object({ messageId: z.string().uuid(), tenantId: z.string().uuid() });

/**
 * Ingest pipeline:
 *  1. Mark message `processing`.
 *  2. Load message + inbox + rules.
 *  3. Build a MessageView and run each rule's executor in priority order.
 *  4. AI calls inside rules go through the LLMProvider registry; usage rows
 *     are written for both BYOK and metered calls.
 *  5. Persist derived JSON + classification + summary on the message.
 *  6. For each fan-out target, look up the matching destination, dispatch
 *     via its driver, and record a `delivery_attempt` row.
 *  7. Mark message `processed` (or `failed` if everything errored).
 */
const ingestWorker = new Worker(
  'ingest',
  async (job: Job) => {
    const parsed = IngestJob.safeParse(job.data);
    if (!parsed.success) {
      logger.error({ err: parsed.error.flatten(), jobId: job.id }, 'invalid ingest job');
      throw new Error('invalid ingest job');
    }
    const { messageId, tenantId } = parsed.data;
    await processMessage(messageId, tenantId);
    logger.info({ jobId: job.id, messageId, tenantId }, 'ingest:processed');
    return { ok: true };
  },
  { connection, concurrency: 4 },
);

ingestWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'ingest:failed');
});

async function processMessage(messageId: string, tenantId: string): Promise<void> {
  // Phase 1: load + mark processing.
  const loaded = await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(schema.message)
      .set({ status: 'processing' })
      .where(eq(schema.message.id, messageId));
    const msg = await tx.query.message.findFirst({ where: eq(schema.message.id, messageId) });
    if (!msg) throw new Error(`message ${messageId} not found`);
    const inbox = await tx.query.inbox.findFirst({ where: eq(schema.inbox.id, msg.inboxId) });
    if (!inbox) throw new Error(`inbox ${msg.inboxId} not found`);
    const rules = await tx.query.rule.findMany({
      where: and(eq(schema.rule.inboxId, inbox.id), eq(schema.rule.enabled, true)),
      orderBy: asc(schema.rule.priority),
    });
    const destinations = await tx.query.destination.findMany({
      where: and(eq(schema.destination.inboxId, inbox.id), eq(schema.destination.enabled, true)),
    });
    return { msg, inbox, rules, destinations };
  });

  const view: MessageView = {
    id: loaded.msg.id,
    channel: '', // resolved by joining channel below
    subject: loaded.msg.subject,
    contentText: loaded.msg.contentText,
    sender: (loaded.msg.sender as MessageView['sender']) ?? null,
    metadata: (loaded.msg.metadata as Record<string, unknown>) ?? {},
    attachments: [],
  };
  if (loaded.msg.channelId) {
    const ch = await withTenant(db, tenantId, (tx) =>
      tx.query.channel.findFirst({ where: eq(schema.channel.id, loaded.msg.channelId!) }),
    );
    view.channel = ch?.kind ?? '';
  }

  // Phase 2: rules engine.
  const aiConfig = (loaded.inbox.aiConfig as { modelId?: string; systemPrompt?: string } | null) ?? null;
  const aiUsageRows: Array<typeof schema.aiUsage.$inferInsert> = [];
  let derived: Record<string, unknown> = {};
  const tags = new Set<string>();
  const fanout = new Map<string, { with?: Record<string, unknown> }>();

  const ctx: RuleContext = {
    now: () => new Date(),
    aiClassify: async (input) => {
      if (!loaded.inbox.aiEnabled || !aiConfig?.modelId) {
        throw new Error('AI is not enabled on this inbox');
      }
      const { provider, model } = providerForModel(aiConfig.modelId);
      const schemaShape = Object.fromEntries(
        Object.entries(input.schema).map(([k, t]) => [
          k,
          t === 'number' ? z.number() : t === 'boolean' ? z.boolean() : z.string(),
        ]),
      );
      const zodSchema = z.object(schemaShape);
      const { value, usage } = await provider.classify({
        modelId: model.id,
        schema: zodSchema,
        messages: [
          ...(aiConfig.systemPrompt ? [{ role: 'system' as const, content: aiConfig.systemPrompt }] : []),
          { role: 'user' as const, content: input.text },
        ],
      });
      const rec = buildUsageRecord({
        tenantId,
        inboxId: loaded.inbox.id,
        messageId,
        modelId: model.id,
        operation: input.op,
        usage,
        byok: false,
      });
      // The DB enum lacks a 'mock' value on purpose (it would leak into
      // billing dashboards). Persist mock usage as `byok` since it has
      // chargeUsdMicros=0 and isn't reported to Stripe.
      const persistedProvider: 'anthropic' | 'google' | 'openai' | 'byok' =
        rec.provider === 'mock' ? 'byok' : rec.provider;
      aiUsageRows.push({
        tenantId: rec.tenantId,
        inboxId: rec.inboxId,
        messageId: rec.messageId,
        provider: persistedProvider,
        model: rec.model,
        operation: rec.operation,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        cachedTokens: rec.cachedTokens,
        costUsdMicros: rec.costUsdMicros,
        chargeUsdMicros: rec.chargeUsdMicros,
      });
      return value;
    },
  };

  for (const rule of loaded.rules) {
    try {
      const res = await executeRule(rule.definition, view, ctx);
      derived = { ...derived, ...res.derived };
      for (const t of res.tags) tags.add(t);
      for (const f of res.fanout) {
        if (!fanout.has(f.destination)) {
          const entry: { with?: Record<string, unknown> } = {};
          if (f.with !== undefined) entry.with = f.with;
          fanout.set(f.destination, entry);
        }
      }
    } catch (err) {
      logger.error({ ruleId: rule.id, err }, 'rule:error');
    }
  }

  // Phase 3: persist derived + ai usage + look up summary/classification.
  await withTenant(db, tenantId, async (tx) => {
    const aiSummary =
      typeof derived['summary'] === 'object' && derived['summary'] !== null
        ? (derived['summary'] as { summary?: string }).summary ?? null
        : null;
    const aiClassification =
      typeof derived['classification'] === 'object' ? derived['classification'] : null;
    await tx
      .update(schema.message)
      .set({
        contentJson: derived,
        aiSummary,
        aiClassification: aiClassification as Record<string, unknown> | null,
      })
      .where(eq(schema.message.id, messageId));
    if (aiUsageRows.length > 0) {
      await tx.insert(schema.aiUsage).values(aiUsageRows);
    }
  });

  // Phase 4: fan-out to destinations.
  for (const [destName, target] of fanout) {
    const destRow = loaded.destinations.find((d) => d.name === destName || d.kind === destName);
    if (!destRow) {
      logger.warn({ destName, messageId }, 'destination not configured, skipping');
      continue;
    }
    const driver = getDriver(destRow.kind);
    if (!driver) {
      logger.warn({ kind: destRow.kind, messageId }, 'no driver registered for destination');
      continue;
    }

    const result = await driver.deliver(
      {
        messageId,
        inboxId: loaded.inbox.id,
        tenantId,
        channel: view.channel,
        receivedAt: loaded.msg.receivedAt.toISOString(),
        subject: loaded.msg.subject,
        contentText: loaded.msg.contentText,
        contentJson: derived,
        sender: (loaded.msg.sender as Record<string, unknown> | null) ?? null,
        derived,
        tags: [...tags],
        ...(target.with !== undefined ? { with: target.with } : {}),
      },
      destRow.config as Record<string, unknown>,
    );

    await withTenant(db, tenantId, async (tx) => {
      await tx.insert(schema.deliveryAttempt).values({
        tenantId,
        messageId,
        destinationId: destRow.id,
        attemptNo: 1,
        status: result.status,
        requestSnapshot: result.request,
        responseSnapshot: result.response,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        finishedAt: new Date(),
      });
    });

    // For now we always continue past a failed destination; per-rule
    // on_failure modes will short-circuit fan-out in a follow-up iteration.
  }

  // Phase 5: mark processed.
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(schema.message)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(schema.message.id, messageId));
  });
}

logger.info('worker started');

async function shutdown() {
  logger.info('worker shutting down');
  await ingestWorker.close();
  await connection.quit();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);