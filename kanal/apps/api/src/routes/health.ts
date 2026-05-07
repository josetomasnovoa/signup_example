import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql as drizzleSql } from 'drizzle-orm';

export async function registerHealth(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /**
   * `/health` is intentionally cheap: it returns 200 as long as the
   * process is alive. Use this for basic liveness probes that should
   * NOT restart the container during transient DB/Redis blips.
   */
  typed.get(
    '/health',
    {
      config: { skipAuth: true },
      schema: {
        response: {
          200: z.object({ status: z.literal('ok'), service: z.string(), uptime: z.number() }),
        },
      },
    },
    async () => ({ status: 'ok' as const, service: 'kanal-api', uptime: process.uptime() }),
  );

  /**
   * `/ready` checks downstream dependencies. Returns 200 when the API is
   * able to serve traffic (DB query and Redis PING both succeed) and 503
   * when any of them fail. Platform load balancers should remove the
   * instance from rotation on /ready failure but NOT restart it.
   */
  typed.get(
    '/ready',
    {
      config: { skipAuth: true },
      schema: {
        response: {
          200: z.object({
            status: z.literal('ready'),
            checks: z.object({ db: z.boolean(), redis: z.boolean() }),
          }),
          503: z.object({
            status: z.literal('not_ready'),
            checks: z.object({ db: z.boolean(), redis: z.boolean() }),
            errors: z.record(z.string()),
          }),
        },
      },
    },
    async (_req, reply) => {
      const errors: Record<string, string> = {};
      let dbOk = false;
      try {
        await app.db.execute(drizzleSql`SELECT 1`);
        dbOk = true;
      } catch (err) {
        errors.db = err instanceof Error ? err.message : String(err);
      }
      let redisOk = false;
      try {
        const pong = await app.redis.ping();
        redisOk = pong === 'PONG';
      } catch (err) {
        errors.redis = err instanceof Error ? err.message : String(err);
      }
      if (dbOk && redisOk) {
        return { status: 'ready' as const, checks: { db: true, redis: true } };
      }
      reply.code(503);
      return {
        status: 'not_ready' as const,
        checks: { db: dbOk, redis: redisOk },
        errors,
      };
    },
  );
}
