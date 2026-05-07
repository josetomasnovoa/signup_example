import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Tiny KMS abstraction. Production runs against AWS KMS / Cloudflare KMS:
 * we wrap a per-tenant DEK with the cloud CMK, store the wrapped DEK and
 * ciphertext in `encrypted_secret`, and unwrap the DEK in-memory just for
 * one inference call.
 *
 * For local dev we provide a `LocalKms` driven by an env var
 * (`KANAL_KMS_KEY`, 32 bytes hex). It is NOT for production but matches the
 * interface so the rest of the system is identical.
 */
export interface Kms {
  /** Wrap a DEK with the master key. Returns base64 ciphertext. */
  wrapDek(dek: Buffer): Promise<{ wrapped: string; keyId: string }>;
  /** Unwrap a DEK previously produced by wrapDek. */
  unwrapDek(wrapped: string, keyId: string): Promise<Buffer>;
}

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * Local KMS for development. Master key comes from `KANAL_KMS_KEY` (64 hex
 * chars = 32 bytes). Refuses to start if missing in non-test mode.
 */
export class LocalKms implements Kms {
  private readonly masterKey: Buffer;
  readonly keyId = 'local:dev';

  constructor(masterKeyHex?: string) {
    const k = masterKeyHex ?? process.env.KANAL_KMS_KEY;
    if (!k || k.length !== 64) {
      throw new Error(
        'LocalKms requires KANAL_KMS_KEY=64 hex chars (32 bytes). Generate with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"hex\\"))"',
      );
    }
    this.masterKey = Buffer.from(k, 'hex');
  }

  async wrapDek(dek: Buffer): Promise<{ wrapped: string; keyId: string }> {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv(ALGO, this.masterKey, nonce);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      wrapped: Buffer.concat([nonce, tag, ct]).toString('base64'),
      keyId: this.keyId,
    };
  }

  async unwrapDek(wrapped: string): Promise<Buffer> {
    const buf = Buffer.from(wrapped, 'base64');
    if (buf.length < NONCE_LEN + TAG_LEN) throw new Error('wrapped DEK too short');
    const nonce = buf.subarray(0, NONCE_LEN);
    const tag = buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
    const ct = buf.subarray(NONCE_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.masterKey, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

let kmsInstance: Kms | null = null;
export function getKms(): Kms {
  if (kmsInstance) return kmsInstance;
  kmsInstance = new LocalKms();
  return kmsInstance;
}

export function setKms(k: Kms): void {
  kmsInstance = k;
}
