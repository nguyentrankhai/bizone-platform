import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Omni Channel (P6.1) — server-only secrets: store keys, customer passwords, OTP, session
 * tokens. Kept apart from `lib/omni/website.ts`, which client components import.
 */

const STORE_KEY_RE = /^bzs\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{40,})$/;

export function newStoreKey(tenantId: string): string {
  return `bzs.${tenantId}.${randomBytes(32).toString("base64url")}`;
}

export function parseStoreKey(key: string | null | undefined): { tenantId: string } | null {
  const m = key ? STORE_KEY_RE.exec(key.trim()) : null;
  return m ? { tenantId: m[1] } : null;
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Shown in the admin screen instead of the key */
export function maskStoreKey(tenantId: string) {
  return `bzs.${tenantId}.••••••••`;
}

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 6-digit one-time code */
export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const newCustomerToken = () => `cst_${randomBytes(32).toString("base64url")}`;
