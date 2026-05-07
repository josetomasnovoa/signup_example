import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listModels, type ModelEntry } from '@kanal/ai';

const ModelDto = z.object({
  id: z.string(),
  provider: z.enum(['anthropic', 'google']),
  displayName: z.string(),
  tier: z.enum(['top', 'balanced', 'fast', 'cheap', 'legacy']),
  contextWindow: z.number().int().positive(),
  capabilities: z.array(z.string()),
  inputPricePer1M: z.number(),
  outputPricePer1M: z.number(),
  cachedInputPricePer1M: z.number().optional(),
  supportsByok: z.boolean(),
  deprecated: z.boolean().optional(),
  replacement: z.string().optional(),
});

function toDto(m: ModelEntry) {
  if (m.provider !== 'anthropic' && m.provider !== 'google') {
    throw new Error(`internal: non-public provider leaked: ${m.provider}`);
  }
  return {
    id: m.id,
    provider: m.provider,
    displayName: m.displayName,
    tier: m.tier,
    contextWindow: m.contextWindow,
    capabilities: [...m.capabilities],
    inputPricePer1M: m.inputPricePer1M,
    outputPricePer1M: m.outputPricePer1M,
    cachedInputPricePer1M: m.cachedInputPricePer1M,
    supportsByok: m.supportsByok,
    deprecated: m.deprecated,
    replacement: m.replacement,
  };
}

export async function registerModels(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/ai/models',
    {
      config: { skipAuth: true },
      schema: {
        querystring: z.object({
          provider: z.enum(['anthropic', 'google']).optional(),
          includeDeprecated: z.coerce.boolean().optional(),
        }),
        response: { 200: z.object({ models: z.array(ModelDto) }) },
      },
    },
    async (req) => {
      const { provider, includeDeprecated } = req.query;
      const opts: Parameters<typeof listModels>[0] = {};
      if (provider !== undefined) opts.provider = provider;
      if (includeDeprecated !== undefined) opts.includeDeprecated = includeDeprecated;
      const visible = listModels(opts).filter(
        (m) => m.provider === 'anthropic' || m.provider === 'google',
      );
      return { models: visible.map(toDto) };
    },
  );
}
