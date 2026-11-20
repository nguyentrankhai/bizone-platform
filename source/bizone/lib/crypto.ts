import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * P6.6 — secrets at rest: AES-256-GCM (authenticated: a modified ciphertext fails to decrypt).
 * Stored as `enc:v1:{iv}:{tag}:{ciphertext}` (base64 parts), the same format as Payment Hub's
 * `lib/crypto.ts`. Server only — never import from client components.
 *
 * Key: `DATA_ENCRYPTION_KEY` (base64, 32 bytes — `openssl rand -base64 32`); when unset,
 * `OMNI_TOKEN_KEY` (P6.2, marketplace tokens were encrypted with it) so existing data still
 * decrypts. Don't change the key once data is encrypted — values become unreadable.
 *
 * In use: marketplace OAuth tokens (`channel_connections`, via lib/omni/crypto.ts). Other secrets
 * are one-way: store keys (SHA-256), website customer passwords (scrypt), staff passwords
 * (Keycloak).
 */

const PREFIX = "enc:v1:";

export class EncryptionKeyError extends Error {}

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY || process.env.OMNI_TOKEN_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32)
    throw new EncryptionKeyError(
      "DATA_ENCRYPTION_KEY / OMNI_TOKEN_KEY chưa cấu hình (base64 32 byte)",
    );
  return k;
}

export function encryptionKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

/** Plain text, or `null` for an empty / foreign / tampered value or a wrong key. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!isEncrypted(stored)) return null;
  const [iv, tag, data] = stored!.slice(PREFIX.length).split(":");
  if (!iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
