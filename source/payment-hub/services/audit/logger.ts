import { EventEmitter } from "node:events";
import { clientIp } from "@/lib/client-ip";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Audit logger of Payment Hub (P7.2, SRS-PH-AUDIT-02) — who did what, from where, with the data
 * before / after, for every administrative action (partner configs, connectors, webhooks, routing,
 * manual refunds, reconciliation, disputes, sign-in / sign-out).
 *
 * Event-driven: callers emit an audit event (`recordAudit`, or `withAudit` around an admin API
 * handler); the logger sanitises it (secrets masked, size capped), appends it to `audit_logs` and
 * then notifies listeners of `auditEvents` ("recorded") — tests and future consumers (P7.3
 * notifications) subscribe there instead of being called by every module.
 *
 * Append-only is enforced by the database (migration 10_audit_log: triggers refuse UPDATE, and
 * DELETE of rows younger than 90 days); the worker purges rows older than AUDIT_RETENTION_DAYS.
 * Transaction lifecycle events stay in transaction_logs / transaction_raw_data (same rule).
 *
 * Writing an audit entry never breaks the business action: a failure is logged to the console.
 */

export type AuditResult = "success" | "failure" | "denied";

export interface AuditActor {
  /** Keycloak subject (or "system:…") */
  id?: string | null;
  username?: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | number | bigint | null;
  result?: AuditResult;
  actor?: AuditActor;
  ipAddress?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  requestPath?: string | null;
  oldData?: unknown;
  newData?: unknown;
  description?: string | null;
}

export const auditEvents = new EventEmitter();
auditEvents.setMaxListeners(50);

// ─── Sanitising ───────────────────────────────────────────────────────────────

/** Keys whose values are never stored (credentials, signatures, tokens). */
const SECRET_KEY =
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

/** Sanitised JSON value capped at MAX_DATA_BYTES (stored as a truncated preview when larger). */
export function toStoredJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  const clean = sanitize(value);
  const text = JSON.stringify(clean);
  if (text.length <= MAX_DATA_BYTES) return clean as Prisma.InputJsonValue;
  return { _truncated: true, size: text.length, preview: text.slice(0, MAX_DATA_BYTES) };
}

// ─── Recording ────────────────────────────────────────────────────────────────

export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const row = await getPrisma().auditLog.create({
      data: {
        action: entry.action.slice(0, 50),
        result: entry.result ?? "success",
        entityType: entry.entityType.slice(0, 50),
        entityId:
          entry.entityId === undefined || entry.entityId === null
            ? null
            : String(entry.entityId).slice(0, 100),
        actorId: entry.actor?.id?.slice(0, 64) ?? null,
        username: entry.actor?.username?.slice(0, 100) ?? null,
        ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        httpMethod: entry.httpMethod?.slice(0, 10) ?? null,
        requestPath: entry.requestPath?.slice(0, 255) ?? null,
        oldData: toStoredJson(entry.oldData),
        newData: toStoredJson(entry.newData),
        description: entry.description?.slice(0, 2000) ?? null,
      },
    });
    auditEvents.emit("recorded", { ...entry, id: row.id });
    return true;
  } catch (e) {
    console.error(
      `[audit] could not record ${entry.action} ${entry.entityType}#${entry.entityId ?? ""}: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}

/** Identity + origin of an admin API request (identity headers are set by proxy.ts only). */
export function requestContext(
  req: Request,
): Pick<AuditEntry, "actor" | "ipAddress" | "userAgent" | "httpMethod" | "requestPath"> {
  return {
    actor: {
      id: req.headers.get("x-user-id"),
      username: req.headers.get("x-user-username") || req.headers.get("x-user-id"),
    },
    ipAddress: clientIp(req.headers) ?? null,
    userAgent: req.headers.get("user-agent"),
    httpMethod: req.method,
    requestPath: new URL(req.url).pathname,
  };
}

export interface AuditSpec {
  action: string;
  entityType: string;
  /** Known before the call (route parameter) */
  entityId?: string | number | null;
  /** From the response `data` (e.g. id of a created row) */
  entityIdFrom?: (data: unknown) => unknown;
  /** State before the change (oldData) */
  before?: () => Promise<unknown>;
  /** Store the JSON request body (default true; false for files / binary bodies) */
  logBody?: boolean;
}

async function jsonOf(r: Request | Response): Promise<unknown> {
  try {
    const text = await r.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Run an admin API handler and append one audit entry for it: success (2xx) with the request
 * body and the resulting `data` as new data (and `before()` as old data), denied (403) or failure
 * (other 4xx / 5xx, with the error message). Unauthenticated calls (401) are not audited — the
 * proxy rejects them before any business code runs.
 */
export async function withAudit(
  req: Request,
  spec: AuditSpec,
  run: () => Promise<Response>,
): Promise<Response> {
  const logBody = spec.logBody !== false && /json/i.test(req.headers.get("content-type") ?? "");
  const body = logBody ? await jsonOf(req.clone()) : undefined;
  const before = spec.before ? await spec.before().catch(() => null) : undefined;

  const res = await run();
  if (res.status === 401) return res;

  const json = (await jsonOf(res.clone())) as {
    data?: unknown;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  const ok = res.status >= 200 && res.status < 300;
  const fromData = ok && spec.entityIdFrom ? spec.entityIdFrom(json?.data) : undefined;
  const entityId =
    spec.entityId ??
    (typeof fromData === "string" || typeof fromData === "number" ? fromData : null);
  const declared = Number(req.headers.get("content-length") ?? 0);

  await recordAudit({
    ...requestContext(req),
    action: spec.action,
    entityType: spec.entityType,
    entityId,
    result: ok ? "success" : res.status === 403 ? "denied" : "failure",
    oldData: before ?? undefined,
    newData: ok
      ? {
          request: body ?? (logBody ? undefined : declared ? { bytes: declared } : undefined),
          result: json?.data,
        }
      : { request: body ?? undefined, error: json?.error },
    description: ok
      ? `HTTP ${res.status}`
      : `HTTP ${res.status}${json?.error?.message ? ` — ${json.error.message}` : ""}`,
  });
  return res;
}

// ─── Retention ────────────────────────────────────────────────────────────────

/** Minimum retention (SRS-PH-AUDIT-01-04 / 02-03) — also enforced by the DB triggers. */
export const MIN_RETENTION_DAYS = 90;

export function retentionDays(): number {
  const n = Number(process.env.AUDIT_RETENTION_DAYS);
  return Number.isInteger(n) && n > MIN_RETENTION_DAYS ? n : MIN_RETENTION_DAYS;
}

/** Delete audit_logs rows older than the retention (worker, daily). */
export async function purgeAuditLogs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - (retentionDays() + 1) * 86_400_000);
  const { count } = await getPrisma().auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
