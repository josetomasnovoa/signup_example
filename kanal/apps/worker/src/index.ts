import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { createDb, schema, withTenant } from '@kanal/db';
import { createLogger } from '@kanal/observability';
import { z } from 'zod';

const logger = createLogger({ service: 'kanal-worker' });

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kanal:kanal@localhost:5432/kanal';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const { db, sql } = createDb({ url: databaseUrl });
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const IngestJob = z.object({
  messageId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

/**
 * Ingest pipeline (skeleton):
 *  1. Mark message `processing`.
 *  2. Run rules engine (TODO — packages/rules executor).
 *  3. Run AI step if enabled (TODO — packages/ai providers).
 *  4. Fan out to destinations (TODO — packages/destinations).
 *  5. Mark message `processed`.
 *
 * Steps 2-4 are no-ops for now; the loop still proves DB connectivity,
 * tenant context propagation and BullMQ wiring end-to-end.
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

    await withTenant(db, tenantId, async (tx) => {
      await tx
        .update(schema.message)
        .set({ status: 'processing' })
        .where(eq(schema.message.id, messageId));
    });

    // TODO: rules + AI + delivery here

    await withTenant(db, tenantId, async (tx) => {
      await tx
        .update(schema.message)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(schema.message.id, messageId));
    });

    logger.info({ jobId: job.id, messageId, tenantId }, 'ingest:processed');
    return { ok: true };
  },
  { connection, concurrency: 4 },
);

ingestWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'ingest:failed');
});

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
