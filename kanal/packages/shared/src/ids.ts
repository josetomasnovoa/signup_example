/**
 * API key format: `kn_live_<base62>` (live) or `kn_test_<base62>` (test).
 * The plaintext is shown only once at creation; only `keyPrefix` and `keyHash`
 * persist in the DB.
 */
export const API_KEY_PREFIX_LIVE = 'kn_live_';
export const API_KEY_PREFIX_TEST = 'kn_test_';

export function isApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX_LIVE) || value.startsWith(API_KEY_PREFIX_TEST);
}
