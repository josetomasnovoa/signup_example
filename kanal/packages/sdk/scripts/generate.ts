import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

/**
 * Generate `src/openapi.d.ts` from a published OpenAPI spec. Reads from
 * `OPENAPI_PATH` (defaults to `<repo>/openapi.json` produced by
 * `pnpm --filter @kanal/api openapi`) and writes typed paths/schemas.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..', '..');
const input = process.env.OPENAPI_PATH ?? resolve(REPO, 'openapi.json');
const output = resolve(ROOT, 'src/openapi.d.ts');

const ast = await openapiTS(new URL(`file://${input}`));
await writeFile(output, astToString(ast));
console.warn(`generated ${output} from ${input}`);
