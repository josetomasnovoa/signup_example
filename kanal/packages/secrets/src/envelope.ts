import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getKms, type Kms } from './kms.js';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;
const DEK_LEN = 32;

export interface SealedSecret {
  /** AES-GCM ciphertext + nonce + tag, base64. */
  ciphertext: string;
  /** KMS-wrapped DEK (base64). */
  dekWrapped: string;
  /** KMS key id used to wrap the DEK. */
  kmsKeyId: string;
}

/**
 * Encrypt a per-tenant secret (e.g. the user's own Anthropic API key) using
 * envelope encryption: a fresh random DEK encrypts the payload with
 * AES-256-GCM, then the DEK is wrapped by KMS. We never persist the DEK
 * unwrapped. Only `unsealSecret` ever exposes it, in-memory, for the
 * duration of one inference call.
 */
export async function sealSecret(plaintext: string, kms: Kms = getKms()): Promise<SealedSecret> {
  const dek = randomBytes(DEK_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, dek, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([nonce, tag, enc]).toString('base64');
  const { wrapped, keyId } = await kms.wrapDek(dek);
  // Best-effort wipe of the DEK buffer (not bullet-proof in V8 but follows
  // the convention to minimise lifetime).
  dek.fill(0);
  return { ciphertext, dekWrapped: wrapped, kmsKeyId: keyId };
}

export async function unsealSecret(sealed: SealedSecret, kms: Kms = getKms()): Promise<string> {
  const buf = Buffer.from(sealed.ciphertext, 'base64');
  if (buf.length < NONCE_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const nonce = buf.subarray(0, NONCE_LEN);
  const tag = buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ct = buf.subarray(NONCE_LEN + TAG_LEN);
  const dek = await kms.unwrapDek(sealed.dekWrapped, sealed.kmsKeyId);
  try {
    const decipher = createDecipheriv(ALGO, dek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } finally {
    dek.fill(0);
  }
}
