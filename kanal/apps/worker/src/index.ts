import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@kanal/observability';
import { InboundMessage } from '@kanal/shared';

const logger = createLogger({ service: 'kanal-worker' });

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Stub `ingest` worker. Future implementation pipeline:
 *  1. Persist Message + Attachments (R2)
 *  2. Optional PII redaction
 *  3. Rules engine (match → transform → route)
 *  4. AI step (optional, BYOK or metered) via @kanal/ai
 *  5. Fan-out DeliveryAttempts to per-destination queues
 */
const ingestWorker = new Worker(
  'ingest',
  async (job: Job) => {
    const parsed = InboundMessage.safeParse(job.data);
    if (!parsed.success) {
      logger.error({ err: parsed.error.flatten(), jobId: job.id }, 'invalid InboundMessage');
      throw new Error('invalid InboundMessage');
    }
    logger.info(
      { jobId: job.id, inboxId: parsed.data.inboxId, channel: parsed.data.channelKind },
      'ingest:received',
    );
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
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
