import { captureException } from "@/lib/sentry";

/**
 * Graceful degradation of the merchant API (P7.5, documents/DR-Runbook-PaymentHub.md §5).
 *
 * An infrastructure failure (database unreachable / pool exhausted, Redis down / timing out) is
 * not a bug of the request: the merchant gets `503 SERVICE_UNAVAILABLE` + `Retry-After` (the
 * API-Design retry contract — same Idempotency-Key, nothing was created) instead of an opaque
 * 500, and the error goes to Sentry once. Any other error is re-thrown (Next → 500 +
 * `onRequestError`).
 */

const PRISMA_INFRA_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2037"]);
const NET_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "EAI_AGAIN",
  "ER_GET_CONNECTION_TIMEOUT",
  "ER_CONNECTION_TIMEOUT",
  "ER_SOCKET_UNEXPECTED_CLOSE",
  "ER_CON_COUNT_ERROR",
  "ER_SERVER_SHUTDOWN",
  "PROTOCOL_CONNECTION_LOST",
]);
const INFRA_MESSAGE =
  /pool timeout|failed to retrieve a connection|can't reach database|connection (?:is )?closed|connect ECONNREFUSED|socket (?:has )?(?:closed|hang up)|Command timed out|Reached the max retries per request|Stream isn't writeable|server has gone away|Lost connection/i;
const INFRA_NAMES = new Set([
  "PrismaClientInitializationError",
  "MaxRetriesPerRequestError",
  "DriverAdapterError",
]);

export function isInfraError(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== "object" || depth > 4) return false;
  const err = e as {
    name?: unknown;
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const name = typeof err.name === "string" ? err.name : "";
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : "";
  if (name === "PrismaClientInitializationError" || name === "MaxRetriesPerRequestError")
    return true;
  if (PRISMA_INFRA_CODES.has(code) || NET_CODES.has(code)) return true;
  if (typeof err.errorCode === "string" && PRISMA_INFRA_CODES.has(err.errorCode)) return true;
  if (
    INFRA_MESSAGE.test(message) &&
    (INFRA_NAMES.has(name) || name.startsWith("Prisma") || name === "Error" || name === "SqlError")
  )
    return true;
  return isInfraError(err.cause, depth + 1);
}

export const RETRY_AFTER_S = 30;

export function serviceUnavailable(
  message = "Service temporarily unavailable — retry later",
): Response {
  return Response.json(
    { success: false, error: { code: "SERVICE_UNAVAILABLE", message } },
    { status: 503, headers: { "Retry-After": String(RETRY_AFTER_S), "cache-control": "no-store" } },
  );
}

/** Run a merchant API handler; infrastructure failures → 503 + Retry-After (reported once). */
export async function guarded(
  req: Request,
  route: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (e) {
    if (!isInfraError(e)) throw e;
    console.error(`[degraded] ${req.method} ${route}: ${(e as Error).message}`);
    captureException(e, {
      tags: { route, degraded: true },
      request: { method: req.method, path: new URL(req.url).pathname },
    });
    return serviceUnavailable();
  }
}
