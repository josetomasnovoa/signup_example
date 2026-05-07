import { GoogleGenAI, Type, type Schema } from '@google/genai';
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

function clientFor(apiKey: string | undefined): GoogleGenAI {
  const key = apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Google API key missing (BYOK or GOOGLE_API_KEY)');
  return new GoogleGenAI({ apiKey: key });
}

function buildContents(req: CompleteRequest) {
  return req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

function systemInstruction(req: CompleteRequest) {
  const sys = req.messages.find((m) => m.role === 'system')?.content;
  return sys ? { parts: [{ text: sys }] } : undefined;
}

function toUsage(u: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): UsageReport {
  return { inputTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0 };
}

function geminiSchemaFromZod<T>(schema: z.ZodType<T>): Schema {
  const def = (schema as unknown as { _def: { typeName?: string; shape?: () => unknown } })._def;
  if (def?.typeName === 'ZodObject' && typeof def.shape === 'function') {
    const shape = def.shape() as Record<string, z.ZodType<unknown>>;
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const inner = (v as unknown as { _def: { typeName?: string } })._def;
      properties[k] = primitiveSchema(inner.typeName);
      required.push(k);
    }
    return { type: Type.OBJECT, properties, required };
  }
  return { type: Type.OBJECT };
}

function primitiveSchema(typeName: string | undefined): Schema {
  switch (typeName) {
    case 'ZodString':
      return { type: Type.STRING };
    case 'ZodNumber':
      return { type: Type.NUMBER };
    case 'ZodBoolean':
      return { type: Type.BOOLEAN };
    default:
      return { type: Type.STRING };
  }
}

class GoogleProvider implements LLMProvider {
  readonly name = 'google' as const;

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const model = requireModel(req.modelId);
    const client = clientFor(req.apiKey);
    const sys = systemInstruction(req);
    const res = await client.models.generateContent({
      model: model.providerModelId,
      contents: buildContents(req),
      config: {
        ...(sys ? { systemInstruction: sys } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    });
    return { text: res.text ?? '', usage: toUsage(res.usageMetadata), raw: res };
  }

  async classify<T>(req: ClassifyRequest<T>): Promise<{ value: T; usage: UsageReport }> {
    const model = requireModel(req.modelId);
    const client = clientFor(req.apiKey);
    const sys = systemInstruction(req);
    const responseSchema = geminiSchemaFromZod(req.schema);
    const res = await client.models.generateContent({
      model: model.providerModelId,
      contents: buildContents(req),
      config: {
        ...(sys ? { systemInstruction: sys } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    const raw = res.text ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Gemini did not return valid JSON: ${raw.slice(0, 200)}`);
    }
    return { value: req.schema.parse(parsed), usage: toUsage(res.usageMetadata) };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const model = requireModel(req.modelId);
    const client = clientFor(req.apiKey);
    const res = await client.models.embedContent({
      model: model.providerModelId,
      contents: req.inputs.map((text) => ({ parts: [{ text }] })),
    });
    const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
    return { vectors, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

registerProvider('google', () => new GoogleProvider());

export const googleProvider = new GoogleProvider();