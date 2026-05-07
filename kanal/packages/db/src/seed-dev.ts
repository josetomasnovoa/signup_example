import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as schema from './schema.js';

/**
 * Local-dev seed: creates a stable demo tenant and inbox so smoke tests and
 * `curl` examples have a target to hit. Idempotent: re-running upserts the
 * same fixed UUIDs. Safe to run repeatedly during development.
 *
 * NEVER run against staging or production.
 */
export const DEMO_TENANT_ID = '00000000-0000-0000-0000-00000000ca1a';
export const DEMO_INBOX_ID = '00000000-0000-0000-0000-00000000beef';

export async function seedDev(databaseUrl: string): Promise<void> {
  const { db, sql } = createDb({ url: databaseUrl, max: 2 });
  try {
    await db
      .insert(schema.tenant)
      .values({ id: DEMO_TENANT_ID, name: 'Demo Tenant', slug: 'demo' })
      .onConflictDoNothing();

    const exists = await db.query.inbox.findFirst({
      where: eq(schema.inbox.id, DEMO_INBOX_ID),
    });
    if (!exists) {
      await db.insert(schema.inbox).values({
        id: DEMO_INBOX_ID,
        tenantId: DEMO_TENANT_ID,
        name: 'Triage',
        slug: 'triage',
        description: 'Local-dev inbox',
      });
    }
  } finally {
    await sql.end();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  seedDev(url)
    .then(() => {
      console.warn(
        `seeded demo tenant=${DEMO_TENANT_ID} inbox=${DEMO_INBOX_ID} (slug: triage)`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('seed failed', err);
      process.exit(1);
    });
}
