/**
 * Uptime monitor logic (P7.5) — pure functions, used by `services/monitor.ts`.
 *
 * A probe result is `ok` / `degraded` (service available, part of it impaired) / `down`
 * (HTTP 503, error or timeout). A status is *confirmed* after `failThreshold` consecutive probes
 * (one blip does not page anyone) and recovery after `recoverThreshold`; alerts fire on confirmed
 * transitions only: down → critical, degraded → warning, back to ok → resolve.
 *
 * Accounting (SLA 99.9 % = 8.76 h downtime / year, 43.2 min / 30 days): the time since the
 * previous probe is attributed to the current probe's raw status — `ok` and `degraded` count as
 * available, `down` as downtime. A gap longer than 3 intervals (the monitor itself was stopped)
 * is counted as `unknown`, not as downtime. Seconds are kept per day (Vietnam time), so the
 * state stays small for years.
 */

export type ProbeStatus = "ok" | "degraded" | "down";
export type TargetStatus = ProbeStatus | "unknown";

export interface ProbeResult {
  status: ProbeStatus;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
  /** Impaired components reported by /api/v1/health */
  components?: string[];
}

export interface TargetState {
  url: string;
  /** Confirmed status */
  status: TargetStatus;
  since: number;
  lastProbeAt: number | null;
  lastResult: ProbeResult | null;
  /** Raw status of the latest probes and how many in a row */
  streak: { status: ProbeStatus; count: number } | null;
  /** Open incidents by severity → start time */
  open: Partial<Record<"down" | "degraded", number>>;
}

export interface DayBucket {
  up: number;
  degraded: number;
  down: number;
  unknown: number;
}

export interface Incident {
  target: string;
  kind: "down" | "degraded";
  startedAt: number;
  endedAt: number | null;
  detail?: string;
}

export interface UptimeState {
  version: 1;
  targets: Record<string, TargetState>;
  days: Record<string, Record<string, DayBucket>>;
  incidents: Incident[];
}

export interface Alert {
  action: "trigger" | "resolve";
  severity: "critical" | "warning" | "info";
  target: string;
  kind: "down" | "degraded";
  dedupKey: string;
  summary: string;
  detail?: string;
  at: number;
}

export interface MonitorOptions {
  intervalMs: number;
  failThreshold: number;
  recoverThreshold: number;
  service?: string;
}

export function emptyState(): UptimeState {
  return { version: 1, targets: {}, days: {}, incidents: [] };
}

/** Day key in Vietnam time (UTC+7). */
export function vnDay(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

function bucketOf(state: UptimeState, day: string, target: string): DayBucket {
  const d = (state.days[day] ??= {});
  return (d[target] ??= { up: 0, degraded: 0, down: 0, unknown: 0 });
}

/** Add `ms` of `kind` between `from` and `to`, split at day boundaries (VN time). */
function account(
  state: UptimeState,
  target: string,
  from: number,
  to: number,
  kind: keyof DayBucket,
): void {
  let t = from;
  while (t < to) {
    const dayStart = Date.parse(`${vnDay(t)}T00:00:00+07:00`);
    const next = Math.min(to, dayStart + 86_400_000);
    bucketOf(state, vnDay(t), target)[kind] += (next - t) / 1000;
    t = next;
  }
}

const dedupKey = (service: string, target: string, kind: string) => `${service}:${target}:${kind}`;

/** Apply one probe; mutates `state`, returns the alerts to send. */
export function applyProbe(
  state: UptimeState,
  target: string,
  url: string,
  result: ProbeResult,
  now: number,
  opts: MonitorOptions,
): Alert[] {
  const service = opts.service ?? "payment-hub";
  const t = (state.targets[target] ??= {
    url,
    status: "unknown",
    since: now,
    lastProbeAt: null,
    lastResult: null,
    streak: null,
    open: {},
  });
  t.url = url;

  // ── accounting ──
  if (t.lastProbeAt !== null && now > t.lastProbeAt) {
    const gap = now - t.lastProbeAt;
    const kind: keyof DayBucket =
      gap > 3 * opts.intervalMs
        ? "unknown"
        : result.status === "down"
          ? "down"
          : result.status === "degraded"
            ? "degraded"
            : "up";
    account(state, target, t.lastProbeAt, now, kind);
  }
  t.lastProbeAt = now;
  t.lastResult = result;

  // ── confirmation ──
  t.streak =
    t.streak?.status === result.status
      ? { status: result.status, count: t.streak.count + 1 }
      : { status: result.status, count: 1 };
  const needed = result.status === "ok" ? opts.recoverThreshold : opts.failThreshold;
  // the very first probes of a new target confirm immediately when healthy
  const confirmNow = t.status === "unknown" && result.status === "ok";
  if (t.status === result.status || (!confirmNow && t.streak.count < needed)) return [];

  const previous = t.status;
  t.status = result.status;
  t.since = now;

  // ── alerts on confirmed transitions ──
  const alerts: Alert[] = [];
  const detail =
    result.error ??
    (result.components?.length ? `Thành phần lỗi: ${result.components.join(", ")}` : undefined);
  const resolve = (kind: "down" | "degraded") => {
    const started = t.open[kind];
    if (started === undefined) return;
    delete t.open[kind];
    const inc = [...state.incidents]
      .reverse()
      .find((i) => i.target === target && i.kind === kind && i.endedAt === null);
    if (inc) inc.endedAt = now;
    alerts.push({
      action: "resolve",
      severity: "info",
      target,
      kind,
      dedupKey: dedupKey(service, target, kind),
      summary: `[${service}] ${target} ${kind === "down" ? "hoạt động trở lại" : "hết suy giảm"} sau ${formatDuration(now - started)}`,
      at: now,
    });
  };
  const trigger = (kind: "down" | "degraded") => {
    if (t.open[kind] !== undefined) return;
    t.open[kind] = now;
    state.incidents.push({ target, kind, startedAt: now, endedAt: null, detail });
    if (state.incidents.length > 500) state.incidents.splice(0, state.incidents.length - 500);
    alerts.push({
      action: "trigger",
      severity: kind === "down" ? "critical" : "warning",
      target,
      kind,
      dedupKey: dedupKey(service, target, kind),
      summary:
        kind === "down"
          ? `[${service}] ${target} KHÔNG HOẠT ĐỘNG (${result.httpStatus ? `HTTP ${result.httpStatus}` : (result.error ?? "không phản hồi")})`
          : `[${service}] ${target} suy giảm — ${detail ?? "một phần hệ thống lỗi"}`,
      detail,
      at: now,
    });
  };

  if (result.status === "ok") {
    resolve("down");
    resolve("degraded");
  } else if (result.status === "down") {
    resolve("degraded");
    trigger("down");
  } else {
    resolve("down");
    trigger("degraded");
  }
  if (previous === "unknown" && result.status === "ok") return [];
  return alerts;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} giờ ${m % 60} phút`;
}

export interface WindowReport {
  days: number;
  observedS: number;
  downS: number;
  degradedS: number;
  unknownS: number;
  /** % of observed time available (ok + degraded); null when nothing observed */
  uptimePct: number | null;
  /** Downtime allowed by the SLA over the whole window / still left */
  budgetS: number;
  budgetLeftS: number;
}

/** Uptime over the last `days` days (VN calendar days, today included). */
export function windowReport(
  state: UptimeState,
  target: string,
  days: number,
  now: number,
  slaPct = 99.9,
): WindowReport {
  let up = 0;
  let degraded = 0;
  let down = 0;
  let unknown = 0;
  for (let i = 0; i < days; i++) {
    const b = state.days[vnDay(now - i * 86_400_000)]?.[target];
    if (!b) continue;
    up += b.up;
    degraded += b.degraded;
    down += b.down;
    unknown += b.unknown;
  }
  const observed = up + degraded + down;
  const budget = (days * 86_400 * (100 - slaPct)) / 100;
  return {
    days,
    observedS: Math.round(observed),
    downS: Math.round(down),
    degradedS: Math.round(degraded),
    unknownS: Math.round(unknown),
    uptimePct: observed > 0 ? Math.round(((up + degraded) / observed) * 1e6) / 1e4 : null,
    budgetS: Math.round(budget),
    budgetLeftS: Math.round(budget - down),
  };
}

/** Drop day buckets older than `keepDays` (default 400 — a year of SLA history). */
export function pruneDays(state: UptimeState, now: number, keepDays = 400): void {
  const oldest = vnDay(now - keepDays * 86_400_000);
  for (const day of Object.keys(state.days)) if (day < oldest) delete state.days[day];
}

/** Interpret an HTTP health response. */
export function interpretHealth(
  httpStatus: number,
  body: unknown,
): { status: ProbeStatus; components?: string[] } {
  const data = (
    body as { data?: { status?: unknown; checks?: Record<string, { status?: string }> } }
  )?.data;
  const components = data?.checks
    ? Object.entries(data.checks)
        .filter(([, c]) => c?.status && c.status !== "ok")
        .map(([name]) => name)
    : undefined;
  if (httpStatus >= 500 || data?.status === "down") return { status: "down", components };
  if (httpStatus < 200 || httpStatus >= 300) return { status: "down", components };
  if (data?.status === "degraded") return { status: "degraded", components };
  return { status: "ok" };
}

export interface Target {
  name: string;
  url: string;
}

/** `MONITOR_TARGETS`: "name=url,name=url" (a bare URL gets a generated name). */
export function parseTargets(raw: string): Target[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const eq = s.indexOf("=");
      return eq > 0 && !s.slice(0, eq).includes("/")
        ? { name: s.slice(0, eq).trim(), url: s.slice(eq + 1).trim() }
        : { name: `target${i + 1}`, url: s };
    });
}
