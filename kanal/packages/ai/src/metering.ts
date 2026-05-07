import { requireModel, type ModelEntry, type ModelTier } from './models.js';
import type { UsageReport } from './provider.js';

/**
 * Tiers map to Stripe metered prices. Adding a model never requires a new
 * Stripe product — we only have one price per tier per direction.
 */
export const BILLABLE_TIERS = ['top', 'balanced', 'fast', 'cheap'] as const;
export type BillableTier = (typeof BILLABLE_TIERS)[number];

export function isBillableTier(tier: ModelTier): tier is BillableTier {
  return (BILLABLE_TIERS as readonly string[]).includes(tier);
}

export interface UsageRecordInput {
  tenantId: string;
  inboxId: string;
  messageId?: string;
  modelId: string;
  operation: 'classify' | 'extract' | 'summarize' | 'generate' | 'translate' | 'embed';
  usage: UsageReport;
  /** True when the call used a tenant-supplied API key (BYOK). */
  byok: boolean;
}

export interface UsageRecord {
  tenantId: string;
  inboxId: string;
  messageId: string | null;
  provider: ModelEntry['provider'];
  model: ModelEntry['providerModelId'];
  operation: UsageRecordInput['operation'];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Internal cost in USD micros (1 USD = 1_000_000 micros). */
  costUsdMicros: number;
  /** What we bill the tenant. 0 when BYOK. */
  chargeUsdMicros: number;
  tier: ModelTier;
}

const MICROS_PER_USD = 1_000_000;

function tokensToMicros(tokens: number, pricePer1M: number): number {
  return Math.round((tokens / 1_000_000) * pricePer1M * MICROS_PER_USD);
}

/**
 * Build the row that the worker will INSERT into `ai_usage` in the same
 * transaction as the message update. The cron `meter:ai` aggregates these
 * by (tenant, period, tier, direction) and POSTs to Stripe usage records.
 */
export function buildUsageRecord(input: UsageRecordInput): UsageRecord {
  const model = requireModel(input.modelId);
  const inputCost = tokensToMicros(input.usage.inputTokens, model.inputPricePer1M);
  const outputCost = tokensToMicros(input.usage.outputTokens, model.outputPricePer1M);
  const cachedCost = model.cachedInputPricePer1M
    ? tokensToMicros(input.usage.cachedTokens ?? 0, model.cachedInputPricePer1M)
    : 0;
  const totalCost = inputCost + outputCost + cachedCost;

  return {
    tenantId: input.tenantId,
    inboxId: input.inboxId,
    messageId: input.messageId ?? null,
    provider: model.provider,
    model: model.providerModelId,
    operation: input.operation,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cachedTokens: input.usage.cachedTokens ?? 0,
    costUsdMicros: totalCost,
    chargeUsdMicros: input.byok ? 0 : totalCost,
    tier: model.tier,
  };
}
