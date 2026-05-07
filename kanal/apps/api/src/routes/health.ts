import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function registerHealth(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({ status: z.literal('ok'), service: z.string(), uptime: z.number() }),
        },
      },
    },
    async () => ({ status: 'ok' as const, service: 'kanal-api', uptime: process.uptime() }),
  );
}
