import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    ingestQueue: Queue;
  }
}

export interface QueuePluginOptions {
  redisUrl: string;
}

export const QUEUE_INGEST = 'ingest';

/**
 * Decorates Fastify with a single Redis connection and the `ingest` BullMQ
 * queue. The worker app holds its own connection — they must point at the
 * same Redis instance.
 */
export const queuePlugin = fp<QueuePluginOptions>(
  async (app, opts) => {
    const redis = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
    const ingestQueue = new Queue(QUEUE_INGEST, { connection: redis });
    app.decorate('redis', redis);
    app.decorate('ingestQueue', ingestQueue);
    app.addHook('onClose', async () => {
      await ingestQueue.close();
      await redis.quit();
    });
  },
  { name: 'kanal-queue' },
);
