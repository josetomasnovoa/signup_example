import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { loggerConfig } from '@kanal/observability';
import { KanalError } from '@kanal/shared';
import { registerHealth } from './routes/health.js';
import { registerModels } from './routes/models.js';
import { registerMessages } from './routes/messages.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    logger: loggerConfig({ service: 'kanal-api' }),
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof KanalError) {
      return reply.status(err.statusCode).send(err.toJSON());
    }
    app.log.error(err);
    return reply.status(500).send({ code: 'internal_error', message: 'Internal Server Error' });
  });

  await registerHealth(app);
  await registerModels(app);
  await registerMessages(app);

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  buildServer()
    .then((app) => app.listen({ port, host: '0.0.0.0' }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
