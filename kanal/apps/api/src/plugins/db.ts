import fp from 'fastify-plugin';
import { createDb, type DB, type SqlClient, type CreateDbOptions } from '@kanal/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    sql: SqlClient;
  }
}

/**
 * Decorates the Fastify instance with `db` (Drizzle) and `sql` (postgres-js).
 * Closes the pool on shutdown.
 */
export const dbPlugin = fp<CreateDbOptions>(
  async (app, opts) => {
    const { db, sql } = createDb(opts);
    app.decorate('db', db);
    app.decorate('sql', sql);
    app.addHook('onClose', async () => {
      await sql.end({ timeout: 5 });
    });
  },
  { name: 'kanal-db' },
);
