/**
 * Single source of truth for AI models offered to tenants.
 *
 * Adding a model = appending a row here. UI dropdowns, billing tier mapping
 * and rules-engine capability validation all read from this registry.
 *
 * Prices are in USD per 1,000,000 tokens and INCLUDE Kanal markup over the
 * provider's list price for the model's tier. BYOK paths bypass billing
 * entirely (charge_usd_micros = 0) but still consult these to render
 * estimated cost in the UI.
 *
 * Deprecation: set `deprecated: true` and (optionally) `replacement` to the
 * successor model id. UI hides deprecated models from new selections but
 * existing inboxes keep working until the configured cutover date.
 */

export type ModelProvider = 'anthropic' | 'google';

export type ModelTier = 'top' | 'balanced' | 'fast' | 'cheap' | 'legacy';

export type ModelCapability =
  | 'vision'
  | 'audio'
  | 'video'
  | 'tools'
  | 'structured'
  | 'long_context';

export type ModelTask =
  | 'classify'
  | 'extract'
  | 'summarize'
  | 'generate'
  | 'translate'
  | 'embed'
  | 'reason';

export interface ModelEntry {
  /** Canonical id used everywhere: `<provider>:<provider-model-id>` */
  id: string;
  provider: ModelProvider;
  /** The provider-native model id passed to the SDK (no `provider:` prefix) */
  providerModelId: string;
  displayName: string;
  tier: ModelTier;
  contextWindow: number;
  capabilities: readonly ModelCapability[];
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedInputPricePer1M?: number;
  /** True if BYOK is supported for this model (default: true) */
  supportsByok: boolean;
  /** Tasks for which this model is the default within its provider */
  defaultForTasks?: readonly ModelTask[];
  deprecated?: boolean;
  replacement?: string;
}

export const MODELS: readonly ModelEntry[] = [
  // ── Anthropic ────────────────────────────────────────────────────────────
  {
    id: 'anthropic:claude-opus-4-7',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    tier: 'top',
    contextWindow: 200_000,
    capabilities: ['vision', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    cachedInputPricePer1M: 1.5,
    supportsByok: true,
    defaultForTasks: ['reason'],
  },
  {
    id: 'anthropic:claude-sonnet-4-6',
    provider: 'anthropic',
    providerModelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    tier: 'balanced',
    contextWindow: 200_000,
    capabilities: ['vision', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    cachedInputPricePer1M: 0.3,
    supportsByok: true,
    defaultForTasks: ['generate', 'translate'],
  },
  {
    id: 'anthropic:claude-haiku-4-5',
    provider: 'anthropic',
    providerModelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    tier: 'fast',
    contextWindow: 200_000,
    capabilities: ['vision', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 1,
    outputPricePer1M: 5,
    cachedInputPricePer1M: 0.1,
    supportsByok: true,
    defaultForTasks: ['classify', 'extract', 'summarize'],
  },

  // ── Google Gemini ────────────────────────────────────────────────────────
  {
    id: 'google:gemini-2.5-pro',
    provider: 'google',
    providerModelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    tier: 'top',
    contextWindow: 1_000_000,
    capabilities: ['vision', 'audio', 'video', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 7,
    outputPricePer1M: 21,
    supportsByok: true,
    defaultForTasks: ['reason'],
  },
  {
    id: 'google:gemini-2.5-flash',
    provider: 'google',
    providerModelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    tier: 'balanced',
    contextWindow: 1_000_000,
    capabilities: ['vision', 'audio', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 0.6,
    outputPricePer1M: 2.5,
    supportsByok: true,
    defaultForTasks: ['generate', 'translate'],
  },
  {
    id: 'google:gemini-2.5-flash-lite',
    provider: 'google',
    providerModelId: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    tier: 'cheap',
    contextWindow: 1_000_000,
    capabilities: ['vision', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    supportsByok: true,
    defaultForTasks: ['classify', 'extract', 'summarize'],
  },
  {
    id: 'google:gemini-2.0-flash',
    provider: 'google',
    providerModelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    tier: 'legacy',
    contextWindow: 1_000_000,
    capabilities: ['vision', 'tools', 'structured', 'long_context'],
    inputPricePer1M: 0.3,
    outputPricePer1M: 1.2,
    supportsByok: true,
    deprecated: true,
    replacement: 'google:gemini-2.5-flash',
  },
] as const;

const MODEL_INDEX: Record<string, ModelEntry> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_INDEX[id];
}

export function requireModel(id: string): ModelEntry {
  const m = MODEL_INDEX[id];
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export function listModels(opts?: {
  provider?: ModelProvider;
  includeDeprecated?: boolean;
}): readonly ModelEntry[] {
  const includeDeprecated = opts?.includeDeprecated ?? false;
  return MODELS.filter((m) => {
    if (opts?.provider && m.provider !== opts.provider) return false;
    if (!includeDeprecated && m.deprecated) return false;
    return true;
  });
}

export function defaultModelForTask(provider: ModelProvider, task: ModelTask): ModelEntry {
  const candidate = MODELS.find(
    (m) => m.provider === provider && !m.deprecated && m.defaultForTasks?.includes(task),
  );
  if (!candidate) {
    throw new Error(`No default model for provider=${provider} task=${task}`);
  }
  return candidate;
}

export function modelSupports(modelId: string, capability: ModelCapability): boolean {
  return getModel(modelId)?.capabilities.includes(capability) ?? false;
}
