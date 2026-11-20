import {
  decryptSecret,
  encryptSecret,
  EncryptionKeyError,
  encryptionKeyConfigured,
} from "@/lib/crypto";

/**
 * Omni Channel (P6.2) — marketplace OAuth tokens at rest. Since P6.6 a thin alias of the
 * shared `lib/crypto.ts` (AES-256-GCM, `enc:v1:` — same format, `OMNI_TOKEN_KEY` still works
 * as the key when `DATA_ENCRYPTION_KEY` is unset). Server only.
 */

export { EncryptionKeyError as TokenKeyError };

export const tokenKeyConfigured = encryptionKeyConfigured;
export const encryptToken = encryptSecret;
export const decryptToken = decryptSecret;
