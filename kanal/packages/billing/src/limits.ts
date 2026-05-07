import { PlanLimitExceededError } from '@kanal/shared';
import { getPlan, type PlanId } from './plans.js';

/**
 * Snapshot of a tenant's current usage for the billing period. The API
 * loads this once at request time (cheap counter read from `usage_counter`)
 * and uses `assertWithinLimits()` to short-circuit work before doing it.
 */
export interface UsageSnapshot {
  inboxesCount: number;
  messagesThisMonth: number;
  storageBytes: number;
  aiTokensThisMonth: number;
}

export type LimitMetric = 'inboxes' | 'messages' | 'storage' | 'aiTokens';

export interface LimitCheck {
  ok: boolean;
  metric: LimitMetric;
  used: number;
  limit: number | null;
}

/**
 * Pure function returning whether each metric is within the plan limits.
 * Returns one row per metric for richer surfaces (banners, soft warnings).
 */
export function checkLimits(plan: PlanId, usage: UsageSnapshot): LimitCheck[] {
  const limits = getPlan(plan).limits;
  return [
    metric('inboxes', usage.inboxesCount, limits.inboxes),
    metric('messages', usage.messagesThisMonth, limits.messagesPerMonth),
    metric('storage', usage.storageBytes, limits.storageBytes),
    metric('aiTokens', usage.aiTokensThisMonth, limits.aiTokensPerMonth),
  ];
}

function metric(name: LimitMetric, used: number, limit: number | null): LimitCheck {
  if (limit === null) return { ok: true, metric: name, used, limit: null };
  return { ok: used < limit, metric: name, used, limit };
}

/**
 * Throws PlanLimitExceededError when any metric is at or above the limit.
 * Use right before doing the work that would push usage further.
 */
export function assertWithinLimits(plan: PlanId, usage: UsageSnapshot, metric: LimitMetric): void {
  const check = checkLimits(plan, usage).find((c) => c.metric === metric);
  if (check && !check.ok) throw new PlanLimitExceededError(metric, check.limit ?? 0);
}
