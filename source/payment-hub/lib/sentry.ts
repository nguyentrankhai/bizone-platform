import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { SECRET_KEY, sanitize } from "@/lib/sanitize";

/**
 * Error reporting to Sentry (P7.5) — a small client of Sentry's public envelope protocol
 * (`POST /api/{project}/envelope/`), no SDK: works the same in the Next app (instrumentation.ts
 * `onRequestError`), the BullMQ worker, the realtime relay and the uptime monitor, adds nothing to
 * client bundles, and any Sentry-compatible endpoint (self-hosted Sentry, GlitchTip) accepts it.
 *
 * Off unless `SENTRY_DSN` is set. Reporting never throws and never blocks the caller for long:
 * one request per event with a 3 s timeout, at most `SENTRY_MAX_EVENTS_PER_MIN` (30) events per
 * process per minute, identical errors within 60 s sent once, Sentry's 429 `Retry-After` obeyed.
 *
 * SRS-PH-NFR-15 (no sensitive logging): extra data goes through `sanitize` (secrets masked by key
 * name); messages and stack traces are scrubbed of URL credentials and `key=value` secrets; only
 * an allowlist of request headers is sent and the query string is dropped.
 */

export interface SentryDsn {
  publicKey: string;
  envelopeUrl: string;
  dsn: string;
}

export type SentryLevel = "fatal" | "error" | "warning" | "info";

export interface CaptureContext {
  level?: SentryLevel;
  /** Low-cardinality labels (route, queue, job name…) — searchable in Sentry */
  tags?: Record<string, string | number | boolean | undefined>;
  /** Free-form context, sanitised before sending */
  extra?: Record<string, unknown>;
  request?: {
    method?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
  /** Grouping override; default = Sentry's own (type + stack) */
  fingerprint?: string[];
}

interface StackFrame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export function parseDsn(raw: string | undefined): SentryDsn | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    const projectId = u.pathname.split("/").filter(Boolean).pop();
    if (!u.username || !projectId || !/^\d+$/.test(projectId)) return null;
    const prefix = u.pathname.slice(0, u.pathname.lastIndexOf("/"));
    return {
      publicKey: decodeURIComponent(u.username),
      envelopeUrl: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/`,
      dsn: `${u.protocol}//${u.username}@${u.host}${u.pathname}`,
    };
  } catch {
    return null;
  }
}

/** Credentials in URLs and `secret=…` pairs removed from free text (error messages, stacks). */
export function scrubText(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer ••••")
    .replace(/(\/\/[^:/@\s]*):[^@/\s]+@/g, "$1:••••@")
    .replace(
      /\b([A-Za-z_-]*(?:secret|password|passwd|token|api[_-]?key|signature|authorization)[A-Za-z_-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi,
      "$1$2••••",
    );
}

const REQUEST_HEADERS = new Set([
  "user-agent",
  "content-type",
  "content-length",
  "accept",
  "x-request-id",
  "x-forwarded-for",
  "x-real-ip",
  "idempotency-key",
]);

function pickHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const name = k.toLowerCase();
    if (!REQUEST_HEADERS.has(name) || SECRET_KEY.test(name)) continue;
    out[name] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** V8 stack → Sentry frames (oldest first). */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n").slice(1)) {
    const m =
      /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line) ?? /^\s*at (.+?) \((.+)\)$/.exec(line);
    if (!m) continue;
    const filename = m[2];
    frames.push({
      function: m[1] || "<anonymous>",
      filename,
      lineno: m[3] ? Number(m[3]) : undefined,
      colno: m[4] ? Number(m[4]) : undefined,
      in_app: !/node_modules|node:internal|^node:/.test(filename),
    });
  }
  return frames.reverse().slice(-50);
}

function errorParts(err: unknown): { type: string; value: string; stack?: string } {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      type: err.name || "Error",
      value: scrubText(`${err.message}${typeof code === "string" ? ` [${code}]` : ""}`).slice(
        0,
        2000,
      ),
      stack: err.stack ? scrubText(err.stack) : undefined,
    };
  }
  return { type: "NonError", value: scrubText(String(err)).slice(0, 2000) };
}

const randomId = () => randomBytes(16).toString("hex");

export interface ReporterOptions {
  dsn: SentryDsn;
  service: string;
  environment?: string;
  release?: string;
  maxPerMinute?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Build the event payload — exported for tests. */
export function buildEvent(
  opts: Pick<ReporterOptions, "service" | "environment" | "release">,
  err: unknown,
  ctx: CaptureContext = {},
  message?: string,
  nowMs = Date.now(),
): Record<string, unknown> {
  const tags: Record<string, string> = { service: opts.service };
  for (const [k, v] of Object.entries(ctx.tags ?? {})) {
    if (v !== undefined) tags[k] = String(v).slice(0, 200);
  }
  const event: Record<string, unknown> = {
    event_id: randomId(),
    timestamp: nowMs / 1000,
    platform: "node",
    level: ctx.level ?? "error",
    logger: `payhub.${opts.service}`,
    server_name: hostname(),
    environment: opts.environment,
    release: opts.release,
    tags,
    contexts: { runtime: { name: "node", version: process.version } },
  };
  if (message !== undefined) {
    event.message = { formatted: scrubText(message).slice(0, 2000) };
  } else {
    const p = errorParts(err);
    event.exception = {
      values: [{ type: p.type, value: p.value, stacktrace: { frames: parseStack(p.stack) } }],
    };
  }
  if (ctx.extra) event.extra = sanitize(ctx.extra);
  if (ctx.request) {
    event.request = {
      method: ctx.request.method,
      // path only: query strings may carry signatures / tokens (IPN, return URLs)
      url: ctx.request.path?.split("?")[0],
      headers: pickHeaders(ctx.request.headers),
    };
  }
  if (ctx.fingerprint) event.fingerprint = ctx.fingerprint;
  return event;
}

export class SentryReporter {
  private readonly pending = new Set<Promise<void>>();
  private windowStart = 0;
  private sentInWindow = 0;
  private pausedUntil = 0;
  private readonly recent = new Map<string, number>();
  readonly sent: string[] = [];

  constructor(private readonly opts: ReporterOptions) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /** Rate limit + dedupe; true when the event may be sent. */
  private admit(signature: string): boolean {
    const now = this.now();
    if (now < this.pausedUntil) return false;
    const last = this.recent.get(signature);
    if (last !== undefined && now - last < 60_000) return false;
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= (this.opts.maxPerMinute ?? 30)) return false;
    this.sentInWindow++;
    this.recent.set(signature, now);
    if (this.recent.size > 500) {
      for (const [k, t] of this.recent) if (now - t >= 60_000) this.recent.delete(k);
    }
    return true;
  }

  capture(err: unknown, ctx: CaptureContext = {}, message?: string): string | null {
    try {
      const p = message !== undefined ? { type: "message", value: message } : errorParts(err);
      const signature = `${p.type}|${p.value}|${ctx.tags?.route ?? ""}|${ctx.tags?.queue ?? ""}`;
      if (!this.admit(signature)) return null;
      const event = buildEvent(this.opts, err, ctx, message, this.now());
      const id = event.event_id as string;
      const task = this.send(event).finally(() => this.pending.delete(task));
      this.pending.add(task);
      return id;
    } catch {
      return null;
    }
  }

  private async send(event: Record<string, unknown>): Promise<void> {
    const { dsn } = this.opts;
    const header = { event_id: event.event_id, sent_at: new Date(this.now()).toISOString() };
    const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(dsn.envelopeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=payhub-reporter/1.0`,
        },
        body,
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 429) {
        const after = Number(res.headers.get("retry-after"));
        this.pausedUntil = this.now() + (Number.isFinite(after) && after > 0 ? after : 60) * 1000;
      } else if (res.ok) {
        this.sent.push(event.event_id as string);
        if (this.sent.length > 100) this.sent.shift();
      }
      await res.body?.cancel().catch(() => {});
    } catch (e) {
      console.error(`[sentry] report failed: ${(e as Error).message}`);
    }
  }

  async flush(timeoutMs = 2000): Promise<void> {
    if (this.pending.size === 0) return;
    await Promise.race([
      Promise.allSettled([...this.pending]),
      new Promise((r) => setTimeout(r, timeoutMs).unref?.()),
    ]);
  }
}

// ─── Process-wide reporter ────────────────────────────────────────────────────

const globalForSentry = globalThis as unknown as {
  payhubSentry?: { reporter: SentryReporter | null; service: string };
};

/** Initialise once per process (`service`: app | worker | realtime | monitor). */
export function initSentry(
  service: string,
  env: Record<string, string | undefined> = process.env,
): SentryReporter | null {
  if (globalForSentry.payhubSentry) return globalForSentry.payhubSentry.reporter;
  const dsn = parseDsn(env.SENTRY_DSN);
  if (env.SENTRY_DSN && !dsn) console.error("[sentry] SENTRY_DSN is invalid — reporting off");
  const max = Number(env.SENTRY_MAX_EVENTS_PER_MIN);
  const reporter = dsn
    ? new SentryReporter({
        dsn,
        service,
        environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || "development",
        release: env.SENTRY_RELEASE || env.APP_VERSION || undefined,
        maxPerMinute: Number.isFinite(max) && max > 0 ? max : 30,
      })
    : null;
  globalForSentry.payhubSentry = { reporter, service };
  if (reporter) console.log(`[sentry] reporting enabled (${service})`);
  return reporter;
}

export function sentryEnabled(): boolean {
  return !!globalForSentry.payhubSentry?.reporter;
}

/** Report an error (no-op when Sentry is off). Returns the event id when sent. */
export function captureException(err: unknown, ctx?: CaptureContext): string | null {
  return globalForSentry.payhubSentry?.reporter?.capture(err, ctx) ?? null;
}

export function captureMessage(message: string, ctx?: CaptureContext): string | null {
  return (
    globalForSentry.payhubSentry?.reporter?.capture(
      undefined,
      { level: "warning", ...ctx },
      message,
    ) ?? null
  );
}

export function flushSentry(timeoutMs?: number): Promise<void> {
  return globalForSentry.payhubSentry?.reporter?.flush(timeoutMs) ?? Promise.resolve();
}

/**
 * Standalone processes (worker, realtime, monitor): report uncaught exceptions / unhandled
 * rejections, then exit 1 as Node would (Docker `restart: unless-stopped` brings the process
 * back) — a crashed process must not linger half-alive.
 */
export function installProcessHandlers(service: string): void {
  initSentry(service);
  const die = (kind: string) => (err: unknown) => {
    console.error(`[${service}] ${kind}:`, err);
    captureException(err, { level: "fatal", tags: { kind } });
    void flushSentry(2000).finally(() => process.exit(1));
  };
  process.on("uncaughtException", die("uncaughtException"));
  process.on("unhandledRejection", die("unhandledRejection"));
}
