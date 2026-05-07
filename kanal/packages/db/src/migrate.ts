import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the package root regardless of whether this file is executing
 * from `src/` (tsx) or `dist/` (compiled). We rely on `migrations/` and
 * `sql/post-migrate/` always living at the package root.
 */
function packageRoot(): string {
  const here = __dirname;
  if (here.endsWith('/dist')) return resolve(here, '..');
  return resolve(here, '..');
}

/**
 * Apply Drizzle migrations + post-migrate SQL files (idempotent).
 *
 * Drizzle owns `migrations/`. Hand-crafted SQL (RLS policies, triggers,
 * pg extensions) lives in `sql/post-migrate/` and runs after Drizzle each
 * call. Files are applied in lexical order; make them idempotent.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const db = drizzle(sql);
    const root = packageRoot();
    await migrate(db, { migrationsFolder: resolve(root, 'migrations') });

    const postMigrateDir = resolve(root, 'sql/post-migrate');
    const files = (await readdir(postMigrateDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const content = await readFile(resolve(postMigrateDir, file), 'utf8');
      await sql.unsafe(content);
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
  runMigrations(url)
    .then(() => {
      console.warn('migrations applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error('migration failed', err);
      process.exit(1);
    });
}
