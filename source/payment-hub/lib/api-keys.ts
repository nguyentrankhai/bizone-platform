import { randomBytes } from "node:crypto";
import { encryptSecret } from "./crypto";

/**
 * Merchant API credentials. The secret is shown to the merchant exactly once and stored
 * AES-256-GCM encrypted (PARTNER_ENCRYPTION_KEY): it must be recoverable to verify HMAC
 * signatures, so it cannot be hashed like a password.
 */
export interface IssuedApiKey {
  apiKey: string;
  /** Plain secret — return to the caller once, never log or persist it. */
  apiSecret: string;
  /** Value for the `api_secret` column. */
  storedSecret: string;
}

export function issueApiKey(): IssuedApiKey {
  const apiKey = `pk_${randomBytes(16).toString("hex")}`;
  const apiSecret = randomBytes(32).toString("hex");
  return { apiKey, apiSecret, storedSecret: encryptSecret(apiSecret) };
}
