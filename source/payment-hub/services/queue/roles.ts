/**
 * Worker roles (P7.4): every worker instance consumes the queues listed in `WORKER_QUEUES`
 * (default: all), so a deployment can run e.g. 3 webhook workers and 1 worker for the rest.
 * Concurrency per queue: `WORKER_CONCURRENCY_<QUEUE>` (WEBHOOK, RECON, DISPUTE, NOTIFICATION).
 */

export const WORKER_ROLES = ["webhook", "recon", "dispute", "notification", "maintenance"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

export const DEFAULT_CONCURRENCY: Record<Exclude<WorkerRole, "maintenance">, number> = {
  webhook: 20,
  recon: 1, // a run may issue thousands of PSP status queries (parallel inside the run)
  dispute: 2,
  notification: 4,
};

export function parseWorkerRoles(raw: string | undefined): Set<WorkerRole> {
  const value = raw?.trim();
  if (!value || value === "all") return new Set(WORKER_ROLES);
  const roles = new Set<WorkerRole>();
  for (const part of value.split(",").map((s) => s.trim().toLowerCase())) {
    if (!part) continue;
    if (!(WORKER_ROLES as readonly string[]).includes(part)) {
      throw new Error(
        `WORKER_QUEUES: unknown queue "${part}" (expected ${WORKER_ROLES.join(", ")} or all)`,
      );
    }
    roles.add(part as WorkerRole);
  }
  if (roles.size === 0) throw new Error("WORKER_QUEUES lists no queue");
  return roles;
}

export function workerConcurrency(
  role: Exclude<WorkerRole, "maintenance">,
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env[`WORKER_CONCURRENCY_${role.toUpperCase()}`]);
  return Number.isInteger(n) && n > 0 && n <= 500 ? n : DEFAULT_CONCURRENCY[role];
}
