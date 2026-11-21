/**
 * Copy of a value that is safe to store or send (P7.2 audit log, P7.5 error reports): secrets
 * masked by key name, long strings / arrays cut, bigint / Date / Decimal turned into JSON values.
 * SRS-PH-NFR-15: no API key, secret, password, token or signature is ever logged.
 */

/** Keys whose values are never stored (credentials, signatures, tokens). */
export const SECRET_KEY =
  /secret|password|passwd|token|api[_-]?key|private|signature|^key\d?$|hash_?secret|authorization|cookie/i;
const MAX_STRING = 2000;
const MAX_ARRAY = 100;
const MAX_DEPTH = 8;
export const MAX_DATA_BYTES = 16_000;

/** Copy of a value safe to store: secrets masked, long strings / arrays cut, bigint → string. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`… ${value.length - MAX_ARRAY} phần tử nữa`);
    return items;
  }
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`;
  // Prisma Decimal, URL… — anything that knows its own JSON form
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") return sanitize(toJSON.call(value), depth + 1);
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return String(value);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) {
      // keep the fact that it was set / changed, never the value
      out[k] = v === null || v === undefined || v === "" ? (v ?? null) : "••••";
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out;
}
