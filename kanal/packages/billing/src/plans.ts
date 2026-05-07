/**
 * Plan registry. Adding a tier means appending a row here and provisioning
 * the corresponding Stripe products. The matching enum lives in
 * `@kanal/db` (subscription_plan); both are wired through the API and the
 * billing UI.
 */

export type PlanId = 'free' | 'pro' | 'team' | 'enterprise';

export interface PlanLimits {
  /** Hard cap on inboxes; null = unlimited */
  inboxes: number | null;
  /** Soft + hard cap on messages per month */
  messagesPerMonth: number | null;
  /** Storage in bytes (R2) included in plan */
  storageBytes: number | null;
  /** Hard cap on AI tokens per month (sum of input + output, metered) */
  aiTokensPerMonth: number | null;
  /** Days messages are retained before purge */
  retentionDays: number;
  /** Number of seats (memberships) included */
  seats: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Stripe product id; null for the free plan or unprovisioned tiers. */
  stripeProductId: string | null;
  monthlyUsd: number;
  limits: PlanLimits;
}

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    stripeProductId: null,
    monthlyUsd: 0,
    limits: {
      inboxes: 1,
      messagesPerMonth: 500,
      storageBytes: 100 * 1024 * 1024,
      aiTokensPerMonth: 100_000,
      retentionDays: 7,
      seats: 1,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    stripeProductId: null,
    monthlyUsd: 29,
    limits: {
      inboxes: 10,
      messagesPerMonth: 50_000,
      storageBytes: 5 * 1024 * 1024 * 1024,
      aiTokensPerMonth: null,
      retentionDays: 90,
      seats: 1,
    },
  },
  {
    id: 'team',
    name: 'Team',
    stripeProductId: null,
    monthlyUsd: 99,
    limits: {
      inboxes: null,
      messagesPerMonth: 200_000,
      storageBytes: 50 * 1024 * 1024 * 1024,
      aiTokensPerMonth: null,
      retentionDays: 365,
      seats: 5,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    stripeProductId: null,
    monthlyUsd: 0,
    limits: {
      inboxes: null,
      messagesPerMonth: null,
      storageBytes: null,
      aiTokensPerMonth: null,
      retentionDays: 1095,
      seats: null,
    },
  },
] as const;

export function getPlan(id: PlanId): Plan {
  const p = PLANS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown plan: ${id}`);
  return p;
}
