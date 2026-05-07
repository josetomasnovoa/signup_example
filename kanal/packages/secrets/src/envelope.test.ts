import { describe, expect, it } from 'vitest';
import { LocalKms } from './kms.js';
import { sealSecret, unsealSecret } from './envelope.js';

const TEST_KEY = 'a'.repeat(64);

describe('envelope encryption', () => {
  const kms = new LocalKms(TEST_KEY);

  it('round-trips a plaintext through KMS-wrapped envelope', async () => {
    const plain = 'sk-ant-very-long-secret-key-12345';
    const sealed = await sealSecret(plain, kms);
    expect(sealed.ciphertext).not.toContain(plain);
    expect(sealed.dekWrapped).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(sealed.kmsKeyId).toBe('local:dev');
    const unsealed = await unsealSecret(sealed, kms);
    expect(unsealed).toBe(plain);
  });

  it('different seals of the same plaintext are non-deterministic', async () => {
    const plain = 'duplicate';
    const a = await sealSecret(plain, kms);
    const b = await sealSecret(plain, kms);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.dekWrapped).not.toBe(b.dekWrapped);
    expect(await unsealSecret(a, kms)).toBe(plain);
    expect(await unsealSecret(b, kms)).toBe(plain);
  });

  it('tampered ciphertext fails authentication', async () => {
    const sealed = await sealSecret('hello', kms);
    const tampered = {
      ...sealed,
      // Flip a byte mid-ciphertext.
      ciphertext: Buffer.from(
        sealed.ciphertext
          .split('')
          .map((c, i) => (i === 30 ? (c === 'a' ? 'b' : 'a') : c))
          .join(''),
        'base64',
      ).toString('base64'),
    };
    await expect(unsealSecret(tampered, kms)).rejects.toThrow();
  });
});
