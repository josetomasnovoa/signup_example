import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DB = PostgresJsDatabase<typeof schema>;
export type SqlClient = postgres.Sql;

export interface CreateDbOptions {
  url: string;
  max?: number;
  idleTimeoutSec?: number;
}

export function createDb(opts: CreateDbOptions): { db: DB; sql: SqlClient } {
  const sql = postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeoutSec ?? 30,
    prepare: false,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

/**
 * Run `fn` inside a transaction with `app.tenant_id` bound to `tenantId`.
 * Every Postgres RLS policy on a tenant-scoped table reads
 * `current_setting('app.tenant_id', true)::uuid` to filter rows.
 */
export async function withTenant<T>(
  db: DB,
  tenantId: string,
  fn: (tx: DB) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
    return fn(tx as unknown as DB);
  });
}
