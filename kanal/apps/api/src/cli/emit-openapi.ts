import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildServer } from '../server.js';

/**
 * Boots the API in-process (without listening on a port), asks Fastify
 * Swagger for the resolved OpenAPI 3.1 document, and writes it to disk.
 * Used by CI to publish the spec for the docs site and the generated SDK.
 *
 * Note: requires DATABASE_URL + REDIS_URL for plugin init. Use stubs in CI.
 */

async function main() {
  const out = process.argv[2] ?? resolve(process.cwd(), 'openapi.json');
  process.env.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder';
  process.env.REDIS_URL ??= 'redis://localhost:6379';

  const app = await buildServer();
  await app.ready();
  const spec = (app as unknown as { swagger: () => unknown }).swagger();
  await writeFile(out, JSON.stringify(spec, null, 2));
  await app.close();
  // eslint-disable-next-line no-console
  console.warn(`openapi spec written to ${out}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
