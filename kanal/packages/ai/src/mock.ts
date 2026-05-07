import type {
  ClassifyRequest,
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  UsageReport,
} from './provider.js';
import { registerProvider } from './provider.js';

/**
 * Deterministic mock provider used by tests and local smoke runs. It does
 * not call any external API. For `classify`, it walks the schema and emits
 * a stable string/number/boolean per field derived from the message text,
 * so assertions can rely on it without recording fixtures.
 */
class MockProvider implements LLMProvider {
  readonly name = 'mock' as const;

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    return {
      text: `mock-reply: ${lastUser?.content ?? ''}`,
      usage: usageFor(req.messages.map((m) => m.content).join(' ')),
    };
  }

  async classify<T>(req: ClassifyRequest<T>): Promise<{ value: T; usage: UsageReport }> {
    const def = (req.schema as unknown as { _def: { typeName?: string; shape?: () => unknown } })
      ._def;
    if (def?.typeName !== 'ZodObject' || typeof def.shape !== 'function') {
      throw new Error('mock.classify only supports ZodObject schemas');
    }
    const shape = def.shape() as Record<string, { _def: { typeName?: string } }>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(shape)) {
      switch (v._def.typeName) {
        case 'ZodString':
          out[k] = `mock_${k}`;
          break;
        case 'ZodNumber':
          out[k] = 1;
          break;
        case 'ZodBoolean':
          out[k] = true;
          break;
        default:
          out[k] = null;
      }
    }
    const value = req.schema.parse(out);
    return { value, usage: usageFor(req.messages.map((m) => m.content).join(' ')) };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    return {
      vectors: req.inputs.map(() => Array.from({ length: 8 }, (_v, i) => i / 8)),
      usage: { inputTokens: req.inputs.join(' ').length, outputTokens: 0 },
    };
  }
}

function usageFor(text: string): UsageReport {
  return { inputTokens: Math.max(1, Math.ceil(text.length / 4)), outputTokens: 16 };
}

registerProvider('mock', () => new MockProvider());

export const mockProvider = new MockProvider();