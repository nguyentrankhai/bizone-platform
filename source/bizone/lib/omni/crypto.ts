import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Omni Channel (P6.2) — marketplace OAuth tokens at rest: AES-256-GCM with `OMNI_TOKEN_KEY`
 * (base64, 32 bytes). Stored as `enc:v1:{iv}:{tag}:{ciphertext}` (base64 parts). Server only.
 */

const PREFIX = "enc:v1:";

export class TokenKeyError extends Error {}

function key(): Buffer {
  const raw = process.env.OMNI_TOKEN_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32)
    throw new TokenKeyError("OMNI_TOKEN_KEY chưa cấu hình (base64 32 byte)");
  return k;
}

export function tokenKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored || !stored.startsWith(PREFIX)) return null;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
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
