import { timingSafeEqual } from "node:crypto";
import { authenticateToken, extractBearerToken } from "@/lib/auth";
import { cachedHealth, publicView, type HealthReport } from "@/server/services/health.service";

/**
 * Health endpoints (P7.5):
 * - `GET /api/v1/health` — monitoring / load balancer. 200 when `ok` or `degraded`, 503 when
 *   `down` (database unreachable). Public summary = component statuses + latency; the detailed
 *   view (messages, worker / queue counts, last backup) needs `X-Health-Token: $HEALTH_TOKEN`
 *   (uptime monitor) or a `payhub-admin` / `payhub-viewer` bearer token.
 * - `GET /api/health` — Docker healthcheck / readiness (same report, response format kept from
 *   P1.2: `data.checks`, `error.code SERVICE_UNAVAILABLE` when down).
 * - `GET /api/health/live` — liveness: the process answers (no dependency checked).
 */

const NO_STORE = { "cache-control": "no-store" };

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function canSeeDetails(req: Request): Promise<boolean> {
  const expected = process.env.HEALTH_TOKEN;
  const given = req.headers.get("x-health-token");
  if (expected && given && sameToken(given, expected)) return true;
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return false;
  const r = await authenticateToken(token);
  return r.ok && r.user.roles.some((role) => role === "payhub-admin" || role === "payhub-viewer");
}

function httpStatus(report: HealthReport): number {
  return report.status === "down" ? 503 : 200;
}

export async function handleHealthV1(req: Request): Promise<Response> {
  const report = await cachedHealth();
  const body = (await canSeeDetails(req)) ? report : publicView(report);
  return Response.json(
    { success: report.status !== "down", data: body },
    { status: httpStatus(report), headers: NO_STORE },
  );
}

export async function handleReadiness(): Promise<Response> {
  const report = publicView(await cachedHealth());
  if (report.status !== "down") {
    return Response.json({ success: true, data: report }, { headers: NO_STORE });
  }
  return Response.json(
    {
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Dependency check failed", details: report },
    },
    { status: 503, headers: NO_STORE },
  );
}

export function handleLiveness(): Response {
  return Response.json(
    { success: true, data: { status: "ok", uptimeS: Math.round(process.uptime()) } },
    { headers: NO_STORE },
  );
}
