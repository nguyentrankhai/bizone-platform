import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getStorage } from "@/lib/storage";
import { liveInstances } from "@/lib/heartbeat";
import {
  MAINTENANCE_LAST_RUN_KEY,
  SCHEDULED_AT_FIELD,
  taskSchedules,
} from "@/services/queue/maintenance";
import { getWebhookQueue } from "@/services/webhook/queue";

/**
 * System health (P7.5) behind `/api/v1/health` (monitoring, load balancers) and `/api/health`
 * (Docker healthcheck). Each component is `ok`, `degraded` or `down`; only a **critical**
 * component makes the whole service `down` (HTTP 503 — take the instance out of rotation).
 *
 * Graceful degradation (documents/DR-Runbook-PaymentHub.md §5): only the database is critical —
 * without it nothing can be read or written. Everything else degrades a part of the service
 * while payments keep working, so it reports `degraded` (HTTP 200) instead of pulling every
 * instance out of the load balancer at once:
 * - redis: rate limits / brute-force rules fail open, idempotency off for new transactions
 *   (refunds refuse with 503), queues fall back to the DB outbox, realtime and caches stop;
 * - workers / scheduler: webhooks, expiry, reconciliation, notifications wait (outbox in DB);
 * - realtime: admin dashboards fall back to polling;
 * - storage: dispute evidence upload / download fails;
 * - connectors: one partner down is isolated (Route Engine skips it, others keep routing);
 * - backup: last successful backup too old (only when BACKUP_MONITOR=true).
 */

export type HealthStatus = "ok" | "degraded" | "down";

export interface ComponentHealth {
  status: HealthStatus;
  latencyMs?: number;
  /** Operator message — only in the detailed view */
  message?: string;
  /** Extra numbers — only in the detailed view */
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthStatus;
  service: "payment-hub";
  version: string | null;
  uptimeS: number;
  checkedAt: string;
  checks: Record<string, ComponentHealth>;
}

export const CRITICAL_COMPONENTS = new Set(["database"]);

/** Worst status, with only critical components able to reach `down`. */
export function overallStatus(checks: Record<string, ComponentHealth>): HealthStatus {
  let status: HealthStatus = "ok";
  for (const [name, c] of Object.entries(checks)) {
    if (c.status === "ok") continue;
    if (c.status === "down" && CRITICAL_COMPONENTS.has(name)) return "down";
    status = "degraded";
  }
  return status;
}

function num(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const n = Number(env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface HealthThresholds {
  probeTimeoutMs: number;
  minWorkers: number;
  minRealtime: number;
  queueBacklog: number;
  backupMonitor: boolean;
  backupMaxAgeH: number;
}

export function healthThresholds(
  env: Record<string, string | undefined> = process.env,
): HealthThresholds {
  return {
    probeTimeoutMs: num(env, "HEALTH_PROBE_TIMEOUT_MS", 3000),
    minWorkers: num(env, "HEALTH_MIN_WORKERS", 1),
    minRealtime: num(env, "HEALTH_MIN_REALTIME", 1),
    queueBacklog: num(env, "HEALTH_QUEUE_BACKLOG", 5000),
    backupMonitor: env.BACKUP_MONITOR === "true",
    backupMaxAgeH: num(env, "BACKUP_MAX_AGE_HOURS", 26),
  };
}

async function timed(
  timeoutMs: number,
  probe: () => Promise<Omit<ComponentHealth, "latencyMs">>,
  onError: HealthStatus = "down",
): Promise<ComponentHealth> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    return { ...r, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: onError,
      latencyMs: Date.now() - start,
      message: (err as Error).message.slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Stalled periodic jobs: last run older than 3 ticks (+ 2 min) of an interval task. */
export function staleTasks(
  lastRuns: Record<string, string>,
  now = Date.now(),
): { task: string; ageS: number | null }[] {
  const out: { task: string; ageS: number | null }[] = [];
  const scheduledAt = Number(lastRuns[SCHEDULED_AT_FIELD]);
  for (const s of taskSchedules()) {
    if (!s.every) continue; // cron tasks (nightly) are not watched here
    const last = Number(lastRuns[s.task]);
    const limit = 3 * s.every + 120_000;
    if (Number.isFinite(last) && last > 0) {
      if (now - last > limit) out.push({ task: s.task, ageS: Math.round((now - last) / 1000) });
    } else if (!(scheduledAt > 0) || now - scheduledAt > limit) {
      // never ran: stalled once the limit passed since the schedulers were registered
      out.push({ task: s.task, ageS: null });
    }
  }
  return out;
}

export async function checkHealth(
  env: Record<string, string | undefined> = process.env,
): Promise<HealthReport> {
  const t = healthThresholds(env);
  const prisma = getPrisma();
  const redis = getRedis();

  const redisProbe = timed(
    t.probeTimeoutMs,
    async () => {
      await redis.ping();
      return { status: "ok" };
    },
    "degraded",
  );
  // Probes that read Redis wait for the ping: Redis down → answered at once instead of each one
  // running into the probe timeout (the BullMQ connection queues commands while offline)
  const NO_REDIS: ComponentHealth = {
    status: "degraded",
    message: "Không kiểm được — Redis không phản hồi",
  };
  const afterRedis = (probe: () => Promise<Omit<ComponentHealth, "latencyMs">>) =>
    redisProbe.then((r) =>
      r.status === "ok" ? timed(t.probeTimeoutMs, probe, "degraded") : NO_REDIS,
    );

  const [database, redisCheck, workers, realtime, queues, storage, connectors, backup] =
    await Promise.all([
      timed(t.probeTimeoutMs, async () => {
        await prisma.$queryRaw`SELECT 1`;
        return { status: "ok" };
      }),
      redisProbe,
      afterRedis(async () => {
        const live = await liveInstances("worker");
        const lastRuns = await redis.hgetall(MAINTENANCE_LAST_RUN_KEY);
        const stale = live.length > 0 ? staleTasks(lastRuns) : [];
        if (live.length < t.minWorkers) {
          return {
            status: "degraded",
            message: `${live.length} worker đang chạy (cần ≥ ${t.minWorkers}) — webhook, hết hạn GD, đối soát đang chờ`,
            details: { live: live.length },
          };
        }
        if (stale.length > 0) {
          return {
            status: "degraded",
            message: `Job định kỳ không chạy: ${stale.map((s) => s.task).join(", ")}`,
            details: { live: live.length, stale },
          };
        }
        return { status: "ok", details: { live: live.length } };
      }),
      afterRedis(async () => {
        const live = await liveInstances("realtime");
        return live.length < t.minRealtime
          ? {
              status: "degraded",
              message: "Không có tiến trình realtime — dashboard chuyển sang poll",
              details: { live: live.length },
            }
          : { status: "ok", details: { live: live.length } };
      }),
      afterRedis(async () => {
        const counts = await getWebhookQueue().getJobCounts(
          "waiting",
          "delayed",
          "active",
          "failed",
        );
        const backlog = (counts.waiting ?? 0) + (counts.delayed ?? 0);
        return backlog > t.queueBacklog
          ? {
              status: "degraded",
              message: `Hàng đợi webhook tồn ${backlog} job (> ${t.queueBacklog})`,
              details: counts,
            }
          : { status: "ok", details: counts };
      }),
      timed(
        t.probeTimeoutMs,
        async () => {
          const driver = getStorage();
          await driver.probe();
          return { status: "ok", details: { driver: driver.name } };
        },
        "degraded",
      ),
      timed(
        t.probeTimeoutMs,
        async () => {
          const rows = await prisma.connector.findMany({
            where: { isActive: true },
            select: { code: true, healthStatus: true },
          });
          const unhealthy = rows.filter((r) => r.healthStatus === "Unhealthy").map((r) => r.code);
          return unhealthy.length
            ? {
                status: "degraded",
                message: `Connector lỗi: ${unhealthy.join(", ")} — định tuyến bỏ qua, đối tác khác vẫn chạy`,
                details: { active: rows.length, unhealthy },
              }
            : { status: "ok", details: { active: rows.length } };
        },
        "degraded",
      ),
      t.backupMonitor
        ? timed(
            t.probeTimeoutMs,
            async () => {
              const last = await prisma.backupRun.findFirst({
                where: { kind: "backup", status: "success" },
                orderBy: { finishedAt: "desc" },
                select: { backupName: true, finishedAt: true, sizeBytes: true },
              });
              const ageH = last ? (Date.now() - last.finishedAt.getTime()) / 3_600_000 : null;
              const details = {
                last: last?.backupName ?? null,
                finishedAt: last?.finishedAt.toISOString() ?? null,
                ageHours: ageH === null ? null : Math.round(ageH * 10) / 10,
              };
              return ageH === null || ageH > t.backupMaxAgeH
                ? {
                    status: "degraded",
                    message: last
                      ? `Backup gần nhất cách ${details.ageHours} giờ (> ${t.backupMaxAgeH})`
                      : "Chưa có backup thành công",
                    details,
                  }
                : { status: "ok", details };
            },
            "degraded",
          )
        : null,
    ]);

  const checks: Record<string, ComponentHealth> = {
    database,
    redis: redisCheck,
    workers,
    realtime,
    queues,
    storage,
    connectors,
  };
  if (backup) checks.backup = backup;

  return {
    status: overallStatus(checks),
    service: "payment-hub",
    version: env.APP_VERSION || env.SENTRY_RELEASE || null,
    uptimeS: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

/** Public view: component statuses only — no messages, counts or error text. */
export function publicView(report: HealthReport): HealthReport {
  const checks: Record<string, ComponentHealth> = {};
  for (const [name, c] of Object.entries(report.checks)) {
    checks[name] = {
      status: c.status,
      ...(c.latencyMs !== undefined ? { latencyMs: c.latencyMs } : {}),
    };
  }
  return { ...report, checks };
}

// ─── Short in-process cache: health is public, probes must not become a load amplifier ───────

const globalForHealth = globalThis as unknown as {
  payhubHealth?: { at: number; report: Promise<HealthReport> };
};

export function cachedHealth(
  maxAgeMs = num(process.env, "HEALTH_CACHE_MS", 5000),
): Promise<HealthReport> {
  const now = Date.now();
  const hit = globalForHealth.payhubHealth;
  if (hit && now - hit.at < maxAgeMs) return hit.report;
  const report = checkHealth();
  globalForHealth.payhubHealth = { at: now, report };
  report.catch(() => {
    if (globalForHealth.payhubHealth?.report === report) globalForHealth.payhubHealth = undefined;
  });
  return report;
}
