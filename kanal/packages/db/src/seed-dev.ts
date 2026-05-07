import { eq } from 'drizzle-orm';
import { generateApiKey, hashApiKey, keyPrefix, SCOPES } from '@kanal/shared';
import { createDb } from './client.js';
import * as schema from './schema.js';

/**
 * Local-dev seed: creates a stable demo tenant, inbox, rule and webhook
 * destination so smoke tests and `curl` examples have a target. A fresh
 * API key is minted each run and printed once.
 *
 * NEVER run against staging or production.
 */
export const DEMO_TENANT_ID = '00000000-0000-0000-0000-00000000ca1a';
export const DEMO_INBOX_ID = '00000000-0000-0000-0000-00000000beef';
export const DEMO_RULE_ID = '00000000-0000-0000-0000-00000000dada';
export const DEMO_WEBHOOK_DEST_ID = '00000000-0000-0000-0000-00000000d111';

const DEMO_RULE_DEFINITION = {
  version: 1 as const,
  name: 'Classify + ship to webhook',
  trigger: 'message.received' as const,
  pipeline: [
    {
      transform: [
        {
          op: 'ai.classify' as const,
          schema: { topic: 'string', urgency: 'string' },
          out: 'classification',
        },
      ],
    },
    {
      route: {
        fanout: [{ destination: 'webhook' }],
        on_failure: 'continue' as const,
      },
    },
  ],
};

export interface SeedResult {
  tenantId: string;
  inboxId: string;
  ruleId: string;
  destinationId: string;
  apiKey: string;
}

export async function seedDev(databaseUrl: string, webhookUrl: string): Promise<SeedResult> {
  const { db, sql } = createDb({ url: databaseUrl, max: 2 });
  try {
    await db
      .insert(schema.tenant)
      .values({ id: DEMO_TENANT_ID, name: 'Demo Tenant', slug: 'demo' })
      .onConflictDoNothing();

    await db
      .insert(schema.inbox)
      .values({
        id: DEMO_INBOX_ID,
        tenantId: DEMO_TENANT_ID,
        name: 'Triage',
        slug: 'triage',
        description: 'Local-dev inbox',
        aiEnabled: true,
        aiConfig: { modelId: 'mock:test', systemPrompt: 'You triage support messages.' },
      })
      .onConflictDoNothing();

    await db
      .insert(schema.rule)
      .values({
        id: DEMO_RULE_ID,
        tenantId: DEMO_TENANT_ID,
        inboxId: DEMO_INBOX_ID,
        name: 'Demo classify + webhook',
        priority: 0,
        enabled: true,
        definition: DEMO_RULE_DEFINITION,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.destination)
      .values({
        id: DEMO_WEBHOOK_DEST_ID,
        tenantId: DEMO_TENANT_ID,
        inboxId: DEMO_INBOX_ID,
        kind: 'webhook',
        name: 'webhook',
        config: { url: webhookUrl, signingSecret: 'whsec_demo' },
        enabled: true,
        retryPolicy: { maxAttempts: 3, backoff: 'exponential', baseMs: 100, maxMs: 1000 },
      })
      .onConflictDoNothing();

    const apiKey = generateApiKey('test');
    await db.insert(schema.apiKey).values({
      tenantId: DEMO_TENANT_ID,
      name: `seed-${new Date().toISOString()}`,
      keyPrefix: keyPrefix(apiKey),
      keyHash: hashApiKey(apiKey),
      scopes: SCOPES as unknown as string[],
    });

    // Verify rule + destination ended up in DB.
    const ruleCheck = await db.query.rule.findFirst({ where: eq(schema.rule.id, DEMO_RULE_ID) });
    if (!ruleCheck) throw new Error('seed: rule not present after upsert');

    return {
      tenantId: DEMO_TENANT_ID,
      inboxId: DEMO_INBOX_ID,
      ruleId: DEMO_RULE_ID,
      destinationId: DEMO_WEBHOOK_DEST_ID,
      apiKey,
    };
  } finally {
    await sql.end();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  const webhook = process.env.WEBHOOK_URL ?? 'http://localhost:4001/sink';
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  seedDev(url, webhook)
    .then((res) => {
      console.warn(`tenant:      ${res.tenantId}`);
      console.warn(`inbox:       ${res.inboxId} (slug: triage)`);
      console.warn(`rule:        ${res.ruleId}`);
      console.warn(`destination: ${res.destinationId} → ${webhook}`);
      console.warn(`api_key:     ${res.apiKey}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('seed failed', err);
      process.exit(1);
    });
}
