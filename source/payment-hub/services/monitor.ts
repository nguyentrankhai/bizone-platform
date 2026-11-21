import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendMail } from "@/lib/mail";
import { captureMessage, installProcessHandlers } from "@/lib/sentry";
import {
  applyProbe,
  emptyState,
  formatDuration,
  interpretHealth,
  parseTargets,
  pruneDays,
  windowReport,
  type Alert,
  type ProbeResult,
  type Target,
  type UptimeState,
} from "@/lib/uptime";

/**
 * Uptime monitor of Payment Hub (P7.5) — `node dist/monitor.mjs` (dev: `npm run dev:monitor`).
 *
 * Polls the health endpoints every `MONITOR_INTERVAL_S` (30 s), confirms a status after
 * `MONITOR_FAIL_THRESHOLD` (2) probes in a row and alerts on confirmed transitions:
 * PagerDuty Events API v2 (`PAGERDUTY_ROUTING_KEY` — trigger / resolve with a stable dedup key)
 * and e-mail (`MONITOR_ALERT_EMAILS`, SMTP_* of lib/mail.ts). Uptime is accounted per day in
 * `MONITOR_STATE_FILE`; `node dist/monitor.mjs report` prints uptime / downtime against the
 * 99.9 % budget (8.76 h / year).
 *
 * It must run **outside** the stack it watches (another host / availability zone, or an
 * external uptime service polling /api/v1/health) — when the whole host is down nobody inside it
 * can page. The compose service (profile `monitoring`) is for a single-host deployment and dev.
 */

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TARGETS = parseTargets(
  env(
    "MONITOR_TARGETS",
    "app=http://localhost:4000/api/v1/health,realtime=http://localhost:4001/health",
  ),
);
const INTERVAL_MS = numEnv("MONITOR_INTERVAL_S", 30) * 1000;
const TIMEOUT_MS = numEnv("MONITOR_TIMEOUT_MS", 5000);
const OPTS = {
  intervalMs: INTERVAL_MS,
  failThreshold: numEnv("MONITOR_FAIL_THRESHOLD", 2),
  recoverThreshold: numEnv("MONITOR_RECOVER_THRESHOLD", 1),
  service: env("MONITOR_SERVICE_NAME", "payment-hub"),
};
const STATE_FILE = path.resolve(env("MONITOR_STATE_FILE", "./monitor-state.json"));
const SLA = numEnv("MONITOR_SLA_PCT", 99.9);

// ─── State file ───────────────────────────────────────────────────────────────

async function loadState(): Promise<UptimeState> {
  try {
    const s = JSON.parse(await readFile(STATE_FILE, "utf8")) as UptimeState;
    return s.version === 1 ? s : emptyState();
  } catch {
    return emptyState();
  }
}

async function saveState(state: UptimeState): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, STATE_FILE);
}

// ─── Probe ────────────────────────────────────────────────────────────────────

async function probe(t: Target): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(t.url, {
      headers: process.env.HEALTH_TOKEN ? { "x-health-token": process.env.HEALTH_TOKEN } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    const r = interpretHealth(res.status, body);
    return { ...r, httpStatus: res.status, latencyMs: Date.now() - start };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; errors?: { code?: string }[] } };
    // undici wraps the socket error; dual-stack connects give an AggregateError
    const code = err.cause?.code ?? err.cause?.errors?.find((x) => x.code)?.code;
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err.name === "TimeoutError" ? `timeout ${TIMEOUT_MS} ms` : (code ?? err.message),
    };
  }
}

// ─── Alert channels ───────────────────────────────────────────────────────────

async function sendPagerDuty(a: Alert): Promise<string> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY;
  if (!routingKey) return "pagerduty: off";
  const res = await fetch(env("PAGERDUTY_EVENTS_URL", "https://events.pagerduty.com/v2/enqueue"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: a.action,
      dedup_key: a.dedupKey,
      ...(a.action === "trigger"
        ? {
            payload: {
              summary: a.summary.slice(0, 1024),
              source: a.target,
              severity: a.severity === "info" ? "info" : a.severity,
              component: OPTS.service,
              timestamp: new Date(a.at).toISOString(),
              custom_details: {
                detail: a.detail,
                url: TARGETS.find((t) => t.name === a.target)?.url,
              },
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`PagerDuty HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `pagerduty: ${a.action}`;
}

async function sendEmail(a: Alert): Promise<string> {
  const to = (process.env.MONITOR_ALERT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return "email: off";
  const r = await sendMail({
    to,
    subject: a.summary,
    text: [
      a.summary,
      a.detail ? `\n${a.detail}` : "",
      `\nThời điểm: ${new Date(a.at).toISOString()}`,
      `Mục tiêu: ${TARGETS.find((t) => t.name === a.target)?.url ?? a.target}`,
      `\nRunbook: documents/DR-Runbook-PaymentHub.md`,
    ].join("\n"),
  });
  return `email: ${r.provider}`;
}

async function dispatch(a: Alert): Promise<void> {
  console.log(`[monitor] ALERT ${a.action} ${a.severity} ${a.dedupKey}: ${a.summary}`);
  const results = await Promise.allSettled([sendPagerDuty(a), sendEmail(a)]);
  for (const r of results) {
    if (r.status === "fulfilled") console.log(`[monitor]   → ${r.value}`);
    else {
      console.error(`[monitor]   → failed: ${(r.reason as Error).message}`);
      captureMessage(`Uptime alert not delivered: ${(r.reason as Error).message}`, {
        tags: { target: a.target },
      });
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

function report(state: UptimeState, now = Date.now()): string {
  const lines: string[] = [`Uptime ${OPTS.service} — SLA ${SLA}% (${new Date(now).toISOString()})`];
  for (const [name, t] of Object.entries(state.targets)) {
    lines.push(`\n${name}  ${t.url}`);
    lines.push(
      `  trạng thái: ${t.status} từ ${new Date(t.since).toISOString()}${t.lastResult ? ` (lần đo cuối ${t.lastResult.latencyMs} ms)` : ""}`,
    );
    for (const days of [1, 30, 365]) {
      const w = windowReport(state, name, days, now, SLA);
      lines.push(
        `  ${String(days).padStart(3)} ngày: uptime ${w.uptimePct === null ? "—" : `${w.uptimePct}%`}` +
          ` · downtime ${formatDuration(w.downS * 1000)} / ngân sách ${formatDuration(w.budgetS * 1000)}` +
          ` (còn ${formatDuration(Math.max(w.budgetLeftS, 0) * 1000)}${w.budgetLeftS < 0 ? ", VƯỢT" : ""})` +
          ` · suy giảm ${formatDuration(w.degradedS * 1000)} · đã đo ${formatDuration(w.observedS * 1000)}` +
          (w.unknownS ? ` · không đo ${formatDuration(w.unknownS * 1000)}` : ""),
      );
    }
    const incidents = state.incidents.filter((i) => i.target === name).slice(-5);
    for (const i of incidents) {
      lines.push(
        `  sự cố ${i.kind}: ${new Date(i.startedAt).toISOString()} → ${i.endedAt ? `${new Date(i.endedAt).toISOString()} (${formatDuration(i.endedAt - i.startedAt)})` : "đang mở"}${i.detail ? ` — ${i.detail}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function round(state: UptimeState): Promise<void> {
  const now = Date.now();
  const results = await Promise.all(TARGETS.map(async (t) => [t, await probe(t)] as const));
  const alerts: Alert[] = [];
  for (const [t, r] of results) alerts.push(...applyProbe(state, t.name, t.url, r, now, OPTS));
  pruneDays(state, now);
  // alerts first: a state file that cannot be written must never silence a page
  for (const a of alerts) await dispatch(a);
  await saveState(state).catch((e: unknown) => {
    console.error(`[monitor] cannot write ${STATE_FILE}: ${(e as Error).message}`);
    captureMessage(`Uptime monitor cannot write its state file: ${(e as Error).message}`);
  });
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "run";
  if (cmd === "report") {
    console.log(report(await loadState()));
    return;
  }
  installProcessHandlers("monitor");
  const state = await loadState();
  if (cmd === "once") {
    await round(state);
    console.log(report(state));
    return;
  }
  console.log(
    `[monitor] ${TARGETS.map((t) => `${t.name}=${t.url}`).join(", ")} every ${INTERVAL_MS / 1000} s` +
      ` (confirm ${OPTS.failThreshold}×) · PagerDuty ${process.env.PAGERDUTY_ROUTING_KEY ? "on" : "off"}` +
      ` · email ${process.env.MONITOR_ALERT_EMAILS ? "on" : "off"} · state ${STATE_FILE}`,
  );

  // Status page for the monitor's own Docker healthcheck / a quick look (GET /status)
  const port = Number(process.env.MONITOR_HTTP_PORT ?? 4002);
  createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
    } else if (req.url === "/status") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(report(state));
    } else res.writeHead(404).end();
  }).listen(port, () => console.log(`[monitor] status on :${port}/status`));

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await round(state);
    } catch (e) {
      console.error(`[monitor] round failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  await tick();
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  const stop = () => {
    clearInterval(timer);
    void saveState(state).finally(() => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main();
