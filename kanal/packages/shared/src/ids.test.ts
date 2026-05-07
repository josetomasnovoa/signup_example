import { describe, expect, it } from 'vitest';
import {
  API_KEY_PREFIX_LIVE,
  API_KEY_PREFIX_TEST,
  generateApiKey,
  hashApiKey,
  isApiKey,
  keyPrefix,
  safeHashEqual,
} from './ids.js';

describe('api key helpers', () => {
  it('generated keys are well-formed', () => {
    const k = generateApiKey('live');
    expect(k.startsWith(API_KEY_PREFIX_LIVE)).toBe(true);
    expect(k.length).toBe(API_KEY_PREFIX_LIVE.length + 32);
    expect(isApiKey(k)).toBe(true);
  });

  it('test env keys carry the test prefix', () => {
    const k = generateApiKey('test');
    expect(k.startsWith(API_KEY_PREFIX_TEST)).toBe(true);
  });

  it('keyPrefix is deterministic and does not include the secret tail', () => {
    const k = generateApiKey('live');
    const p = keyPrefix(k);
    expect(p.length).toBe(API_KEY_PREFIX_LIVE.length + 8);
    expect(k.startsWith(p)).toBe(true);
    expect(p.length).toBeLessThan(k.length);
  });

  it('hash is stable and 64 hex chars', () => {
    const k = 'kn_live_abcdef0123456789';
    const h = hashApiKey(k);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k)).toBe(h);
    expect(hashApiKey(k + 'x')).not.toBe(h);
  });

  it('safeHashEqual is constant-time and correct', () => {
    const a = hashApiKey('one');
    expect(safeHashEqual(a, a)).toBe(true);
    expect(safeHashEqual(a, hashApiKey('two'))).toBe(false);
    expect(safeHashEqual(a, a.slice(0, 10))).toBe(false);
  });

  it('keyPrefix throws on non-Kanal input', () => {
    expect(() => keyPrefix('sk-openai-xxx')).toThrow();
  });
});
