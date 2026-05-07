import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * API key format: `kn_live_<base62>` (live) or `kn_test_<base62>` (test).
 * The plaintext is shown only once at creation; only `keyPrefix` and `keyHash`
 * persist in the DB.
 */
export const API_KEY_PREFIX_LIVE = 'kn_live_';
export const API_KEY_PREFIX_TEST = 'kn_test_';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function isApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX_LIVE) || value.startsWith(API_KEY_PREFIX_TEST);
}

/**
 * `keyPrefix` is the first 8 chars after the env prefix — enough to look up
 * candidate rows quickly without disclosing the full key.
 */
export function keyPrefix(apiKey: string): string {
  if (apiKey.startsWith(API_KEY_PREFIX_LIVE)) {
    return apiKey.slice(0, API_KEY_PREFIX_LIVE.length + 8);
  }
  if (apiKey.startsWith(API_KEY_PREFIX_TEST)) {
    return apiKey.slice(0, API_KEY_PREFIX_TEST.length + 8);
  }
  throw new Error('Not a Kanal API key');
}

/** SHA-256 hex of the full key. We only ever store/compare hashes. */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/** Constant-time hex equality. */
export function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Generate a fresh API key. Caller is responsible for storing only the hash. */
export function generateApiKey(env: 'live' | 'test' = 'live'): string {
  const bytes = randomBytes(32);
  let body = '';
  for (let i = 0; i < bytes.length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return (env === 'live' ? API_KEY_PREFIX_LIVE : API_KEY_PREFIX_TEST) + body;
}
