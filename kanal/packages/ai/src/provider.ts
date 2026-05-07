import type { z } from 'zod';
import { getModel, type ModelEntry, type ModelProvider } from './models.js';

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteRequest {
  modelId: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Per-request override of the API key (used for BYOK). Never log this. */
  apiKey?: string;
}

export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface CompleteResponse {
  text: string;
  usage: UsageReport;
  raw?: unknown;
}

export interface ClassifyRequest<T> extends CompleteRequest {
  schema: z.ZodType<T>;
}

export interface EmbedRequest {
  modelId: string;
  inputs: string[];
  apiKey?: string;
}

export interface EmbedResponse {
  vectors: number[][];
  usage: UsageReport;
}

/**
 * Provider-agnostic LLM interface. Each implementation translates these
 * common parameters into its own SDK call. Workers consume providers
 * exclusively through this surface so adding a model is one-row work.
 */
export interface LLMProvider {
  readonly name: ModelProvider;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  classify<T>(req: ClassifyRequest<T>): Promise<{ value: T; usage: UsageReport }>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
}

export type ProviderFactory = () => LLMProvider;

const REGISTRY = new Map<ModelProvider, ProviderFactory>();

export function registerProvider(name: ModelProvider, factory: ProviderFactory): void {
  REGISTRY.set(name, factory);
}

/** Resolve the right LLMProvider for a canonical model id like `anthropic:...`. */
export function providerForModel(modelId: string): { provider: LLMProvider; model: ModelEntry } {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const factory = REGISTRY.get(model.provider);
  if (!factory) {
    throw new Error(`No provider registered for ${model.provider}. Did you import its adapter?`);
  }
  return { provider: factory(), model };
}
