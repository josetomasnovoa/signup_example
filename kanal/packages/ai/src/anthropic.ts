import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { requireModel } from './models.js';
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

function clientFor(apiKey: string | undefined): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Anthropic API key missing (BYOK or ANTHROPIC_API_KEY)');
  return new Anthropic({ apiKey: key });
}

function splitMessages(req: CompleteRequest) {
  const system = req.messages.find((m) => m.role === 'system')?.content;
  const messages = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, messages };
}

function toUsage(u: { input_tokens?: number; output_tokens?: number }): UsageReport {
  return { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

function jsonSchemaFromZod<T>(schema: z.ZodType<T>): Record<string, unknown> {
  // Lightweight pass: rely on Zod's `_def` to derive a JSON schema for tool
  // input. For richer schemas we will add `zod-to-json-schema` later.
  return zodLiteralToJsonSchema(schema);
}

function zodLiteralToJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  // Best-effort conversion for the subset used by the rules DSL: object of
  // primitive fields. Falls back to permissive shape when the type isn't
  // recognised.
  const def = (schema as unknown as { _def: { typeName?: string; shape?: () => unknown } })._def;
  if (def?.typeName === 'ZodObject' && typeof def.shape === 'function') {
    const shape = def.shape() as Record<string, z.ZodType<unknown>>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const inner = (v as unknown as { _def: { typeName?: string } })._def;
      properties[k] = primitiveType(inner.typeName);
      required.push(k);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return { type: 'object', additionalProperties: true };
}

function primitiveType(typeName: string | undefined): Record<string, unknown> {
  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    default:
      return {};
  }
}

class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const model = requireModel(req.modelId);
    const client = clientFor(req.apiKey);
    const { system, messages } = splitMessages(req);
    const res = await client.messages.create({
      model: model.providerModelId,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(system ? { system } : {}),
      messages,
    });
    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');
    return { text, usage: toUsage(res.usage), raw: res };
  }

  async classify<T>(req: ClassifyRequest<T>): Promise<{ value: T; usage: UsageReport }> {
    const model = requireModel(req.modelId);
    const client = clientFor(req.apiKey);
    const { system, messages } = splitMessages(req);
    const inputSchema = jsonSchemaFromZod(req.schema);
    const res = await client.messages.create({
      model: model.providerModelId,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(system ? { system } : {}),
      messages,
      tools: [
        {
          name: 'emit_classification',
          description: 'Emit the classification result.',
          input_schema: inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'emit_classification' },
    });
    const tool = res.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use' && c.name === 'emit_classification',
    );
    if (!tool) throw new Error('Anthropic did not return a tool_use block');
    const value = req.schema.parse(tool.input);
    return { value, usage: toUsage(res.usage) };
  }

  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    throw new Error('Anthropic embeddings not implemented; use Voyage or OpenAI');
  }
}

registerProvider('anthropic', () => new AnthropicProvider());

export const anthropicProvider = new AnthropicProvider();