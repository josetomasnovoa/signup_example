import { eq } from 'drizzle-orm';
import { generateApiKey, hashApiKey, keyPrefix, type Scope, SCOPES } from '@kanal/shared';
import { createDb } from './client.js';
import * as schema from './schema.js';

export interface MintOptions {
  databaseUrl: string;
  tenantId: string;
  name: string;
  scopes?: readonly Scope[];
  env?: 'live' | 'test';
}

export interface MintResult {
  /** Plaintext api key. Show this to the user once and never again. */
  apiKey: string;
  apiKeyId: string;
  prefix: string;
}

/**
 * Mint a fresh API key for a tenant. Stores only the SHA-256 hash + the
 * keyPrefix lookup column. The plaintext is returned to the caller exactly
 * once and must not be persisted anywhere by Kanal.
 */
export async function mintApiKey(opts: MintOptions): Promise<MintResult> {
  const { db, sql } = createDb({ url: opts.databaseUrl, max: 2 });
  try {
    const tenant = await db.query.tenant.findFirst({
      where: eq(schema.tenant.id, opts.tenantId),
    });
    if (!tenant) throw new Error(`tenant ${opts.tenantId} not found`);

    const apiKey = generateApiKey(opts.env ?? 'live');
    const prefix = keyPrefix(apiKey);
    const hash = hashApiKey(apiKey);

    const [row] = await db
      .insert(schema.apiKey)
      .values({
        tenantId: opts.tenantId,
        name: opts.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: (opts.scopes ?? SCOPES) as unknown as string[],
      })
      .returning({ id: schema.apiKey.id });

    return { apiKey, apiKeyId: row!.id, prefix };
  } finally {
    await sql.end();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2] ?? process.env.TENANT_ID;
  const name = process.argv[3] ?? 'cli-mint';
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... mint-api-key <tenantId> [name]');
    process.exit(1);
  }
  mintApiKey({ databaseUrl: url, tenantId, name })
    .then((res) => {
      console.warn(`api_key_id: ${res.apiKeyId}`);
      console.warn(`prefix:     ${res.prefix}`);
      console.warn(`apiKey:     ${res.apiKey}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('mint failed', err);
      process.exit(1);
    });
}
