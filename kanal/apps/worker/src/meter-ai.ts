import { and, inArray, isNull, sql } from 'drizzle-orm';
import type { Logger } from '@kanal/observability';
import { createBillingClient, type BillingClient } from '@kanal/billing';
import { schema, type DB } from '@kanal/db';

/**
 * meter:ai — periodic aggregation of `ai_usage` rows into Stripe usage
 * records. Runs every `intervalMs` ms in the worker process. Marks each
 * row as reported by setting `stripe_usage_record_id`. Idempotency is
 * enforced both at the row level (UPDATE WHERE stripe_usage_record_id IS
 * NULL) and at Stripe (idempotency key = tenantId|period|bucket).
 *
 * In a production deployment we'd factor this into a dedicated worker
 * with horizontal locks; for now one node is the source of truth and the
 * `stripe_usage_record_id IS NULL` predicate keeps it correct enough.
 */
export interface MeterDeps {
  db: DB;
  billing: BillingClient;
  logger: Logger;
}

export async function meterAiOnce(deps: MeterDeps): Promise<{ rows: number; reported: number }> {
  const pending = await deps.db
    .select()
    .from(schema.aiUsage)
    .where(
      and(
        isNull(schema.aiUsage.stripeUsageRecordId),
        // Don't report BYOK usage (charge=0).
        sql`${schema.aiUsage.chargeUsdMicros} > 0`,
      ),
    )
    .limit(500);

  if (pending.length === 0) return { rows: 0, reported: 0 };

  const buckets = new Map<
    string,
    { tenantId: string; bucket: string; periodLabel: string; rowIds: string[]; quantity: number }
  >();
  for (const row of pending) {
    const period = row.createdAt.toISOString().slice(0, 7); // YYYY-MM
    const direction = 'input_output';
    const bucket = `${row.provider}:${row.model}:${direction}`;
    const key = `${row.tenantId}|${period}|${bucket}`;
    const cur = buckets.get(key) ?? {
      tenantId: row.tenantId,
      bucket,
      periodLabel: period,
      rowIds: [],
      quantity: 0,
    };
    cur.rowIds.push(row.id);
    cur.quantity += row.inputTokens + row.outputTokens;
    buckets.set(key, cur);
  }

  let reported = 0;
  for (const agg of buckets.values()) {
    // The Stripe Subscription Item id would normally come from the
    // tenant's `subscription` row joined on the metered price. Until that
    // exists we pass a synthetic placeholder; the stub client logs and
    // succeeds, the real client would skip if missing.
    const subscriptionItemId = `si_placeholder_${agg.bucket}`;
    const res = await deps.billing.reportAiUsage({
      tenantId: agg.tenantId,
      subscriptionItemId,
      quantity: agg.quantity,
      periodLabel: agg.periodLabel,
      bucket: agg.bucket,
    });
    if (res.ok) {
      // Mark all rows in this bucket as reported. When the stub client is
      // active we still mark them (with placeholder id) so subsequent
      // ticks don't double-process.
      const stamp = res.usageRecordId ?? `stub_${agg.tenantId}_${agg.periodLabel}_${agg.bucket}`;
      await deps.db
        .update(schema.aiUsage)
        .set({ stripeUsageRecordId: stamp })
        .where(inArray(schema.aiUsage.id, agg.rowIds));
      reported += agg.rowIds.length;
    }
  }

  return { rows: pending.length, reported };
}

export function startMeterAi(deps: MeterDeps, intervalMs: number): { stop: () => void } {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await meterAiOnce(deps);
      if (r.rows > 0) deps.logger.info({ ...r, hasStripe: deps.billing.hasStripe() }, 'meter:ai');
    } catch (err) {
      deps.logger.error({ err }, 'meter:ai failed');
    }
  };
  const handle = setInterval(() => void tick(), intervalMs);
  // Run once at boot so test runs see immediate effect.
  void tick();
  return {
    stop: () => {
      stopped = true;
      clearInterval(handle);
    },
  };
}

export function defaultBillingClient(): BillingClient {
  return createBillingClient();
}
