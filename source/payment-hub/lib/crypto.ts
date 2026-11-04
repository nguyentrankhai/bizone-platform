import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (partner API keys, hash secrets).
 *
 * Stored format: `enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>`
 * Key: env PARTNER_ENCRYPTION_KEY — 32 bytes, base64 (generate: `openssl rand -base64 32`).
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.PARTNER_ENCRYPTION_KEY;
  if (!raw) throw new Error("PARTNER_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PARTNER_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    throw new Error("Secret is not encrypted (expected enc:v1: prefix)");
  }
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || ctB64 === undefined) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** Mask a secret for display/logging: keep the last 4 characters. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}
