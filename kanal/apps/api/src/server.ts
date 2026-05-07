import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import { loggerConfig } from '@kanal/observability';
import { KanalError } from '@kanal/shared';
import { dbPlugin } from './plugins/db.js';
import { queuePlugin } from './plugins/queue.js';
import { authPlugin } from './plugins/auth.js';
import { registerHealth } from './routes/health.js';
import { registerModels } from './routes/models.js';
import { registerMessages } from './routes/messages.js';
import { registerInboxes } from './routes/inboxes.js';
import { registerChannels } from './routes/channels.js';
import { registerRules } from './routes/rules.js';
import { registerDestinations } from './routes/destinations.js';
import { registerApiKeys } from './routes/api-keys.js';
import { registerWhatsAppWebhook } from './routes/webhooks/whatsapp.js';
import { registerPostmarkWebhook } from './routes/webhooks/postmark.js';

export interface BuildServerOptions {
  databaseUrl?: string;
  redisUrl?: string;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    logger: loggerConfig({ service: 'kanal-api' }),
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Kanal API', version: '0.0.0' },
      servers: [{ url: 'https://api.kanal.app' }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'kn_live_<base62> | kn_test_<base62>',
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof KanalError) {
      return reply.status(err.statusCode).send(err.toJSON());
    }
    // Fastify validation errors (FST_ERR_VALIDATION) carry a `validation`
    // array and a 4xx statusCode — surface as 400 with details, not 500.
    const fastifyErr = err as {
      statusCode?: number;
      code?: string;
      validation?: unknown[];
      message?: string;
    };
    if (fastifyErr.validation && Array.isArray(fastifyErr.validation)) {
      return reply.status(fastifyErr.statusCode ?? 400).send({
        code: 'validation_error',
        message: fastifyErr.message ?? 'Validation failed',
        details: { validation: fastifyErr.validation },
      });
    }
    app.log.error(err);
    return reply.status(500).send({ code: 'internal_error', message: 'Internal Server Error' });
  });

  await app.register(dbPlugin, {
    url: opts.databaseUrl ?? process.env.DATABASE_URL ?? 'postgres://kanal:kanal@localhost:5432/kanal',
  });
  await app.register(queuePlugin, {
    redisUrl: opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await app.register(authPlugin);

  await registerHealth(app);
  await registerModels(app);
  await registerMessages(app);
  await registerInboxes(app);
  await registerChannels(app);
  await registerRules(app);
  await registerDestinations(app);
  await registerApiKeys(app);
  await registerWhatsAppWebhook(app);
  await registerPostmarkWebhook(app);

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
