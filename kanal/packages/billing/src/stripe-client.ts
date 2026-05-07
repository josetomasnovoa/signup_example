import Stripe from 'stripe';

/**
 * Thin Stripe wrapper. The `meter:ai` cron worker calls
 * `reportAiUsage()` per (tenant × tier × direction) aggregate window. The
 * `idempotencyKey` is computed from those keys so retries are safe.
 *
 * When `STRIPE_SECRET_KEY` is unset (local dev / tests / no-bill mode) we
 * return a no-op stub that just logs the intended call. This lets the rest
 * of the system run without Stripe credentials.
 */
export interface UsageReport {
  tenantId: string;
  /** Stripe Subscription Item id (Pro plan + this metric's price). */
  subscriptionItemId: string;
  quantity: number;
  /** Period anchor used to derive the idempotency key. */
  periodLabel: string;
  /** Tier + direction for keying. */
  bucket: string;
  timestamp?: number;
}

export interface BillingClient {
  reportAiUsage(report: UsageReport): Promise<{ ok: boolean; usageRecordId: string | null }>;
  hasStripe(): boolean;
}

class RealStripeClient implements BillingClient {
  private readonly stripe: Stripe;
  constructor(secret: string) {
    this.stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion });
  }
  hasStripe() {
    return true;
  }
  async reportAiUsage(r: UsageReport) {
    const idempotencyKey = `ai|${r.tenantId}|${r.periodLabel}|${r.bucket}`;
    const rec = await this.stripe.subscriptionItems.createUsageRecord(
      r.subscriptionItemId,
      {
        quantity: r.quantity,
        timestamp: r.timestamp ?? Math.floor(Date.now() / 1000),
        action: 'increment',
      },
      { idempotencyKey },
    );
    return { ok: true, usageRecordId: rec.id };
  }
}

class StubBillingClient implements BillingClient {
  private readonly logger: (msg: string, data: unknown) => void;
  constructor(logger?: (msg: string, data: unknown) => void) {
    this.logger = logger ?? ((m, d) => console.warn(`[billing-stub] ${m}`, d));
  }
  hasStripe() {
    return false;
  }
  async reportAiUsage(r: UsageReport) {
    this.logger('reportAiUsage (stub)', r);
    return { ok: true, usageRecordId: null };
  }
}

export function createBillingClient(): BillingClient {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return new StubBillingClient();
  return new RealStripeClient(secret);
}
