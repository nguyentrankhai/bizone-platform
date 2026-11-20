import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { ConnectorConfig } from "./types";
import { SANDBOX_HOST_SOURCE } from "./sandbox-host-source";

/**
 * Connector sandbox (P7.1, SRS §3.3.6 / SRS-PH-PARTNER-02-08) — every plugin runs in its own Node
 * child process started from services/connectors/sandbox-host.mjs:
 *   - process isolation: a crash, a hang or a memory blow-up only kills that process; the core and
 *     other connectors keep running (the next call starts a fresh process)
 *   - permission model: no file writes, no child processes / workers / addons, reads only the
 *     plugin directory; only harmless built-ins importable; fetch limited to allowed hosts
 *   - resource isolation: heap limit (CONNECTOR_SANDBOX_MAX_HEAP_MB), ≤ MAX_INFLIGHT concurrent
 *     calls, per-call timeout — a call that times out kills the process (it may be stuck in a
 *     loop), crash loops trip a short breaker (calls fail fast)
 *   - state isolation: the environment of the child only has NODE_ENV / TZ — Hub secrets
 *     (DATABASE_URL, PARTNER_ENCRYPTION_KEY…) never reach plugin code; the partner config of a call
 *     is passed with that call only
 * Plugin log lines are prefixed with the connector code and have the secrets of recent calls
 * masked (Security Contract: no sensitive logging).
 */

const MAX_HEAP_MB = Number(process.env.CONNECTOR_SANDBOX_MAX_HEAP_MB ?? 128);
const MAX_INFLIGHT = 50;
const START_TIMEOUT_MS = 10_000;
const CRASH_WINDOW_MS = 60_000;
const CRASH_LIMIT = 5;
const CRASH_COOLDOWN_MS = 30_000;
const LOG_LINE_MAX = 1000;

/** Directory where processes extract plugin packages (and write the sandbox host). */
export function pluginBaseDir(): string {
  const base = process.env.CONNECTOR_PLUGIN_DIR || path.join(os.tmpdir(), "payhub-connectors");
  mkdirSync(base, { recursive: true, mode: 0o700 });
  return base;
}

let hostPath: string | null = null;

/**
 * The host script on disk: services/connectors/sandbox-host.mjs, embedded at build time
 * (sandbox-host-source.ts) and written once under the plugin directory — independent of the
 * working directory and of how the process was bundled. Named by content hash, written atomically.
 */
export function sandboxHostPath(): string {
  if (process.env.CONNECTOR_SANDBOX_HOST) return process.env.CONNECTOR_SANDBOX_HOST;
  if (hostPath && existsSync(hostPath)) return hostPath;
  const hash = createHash("sha256").update(SANDBOX_HOST_SOURCE).digest("hex").slice(0, 12);
  const file = path.join(pluginBaseDir(), `sandbox-host-${hash}.mjs`);
  if (!existsSync(file)) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, SANDBOX_HOST_SOURCE, { mode: 0o600 });
    renameSync(tmp, file);
  }
  hostPath = file;
  return file;
}

export class SandboxError extends Error {
  constructor(
    message: string,
    /** Error code thrown by the plugin (VALIDATION_ERROR… — business errors stop the fallback) */
    public readonly code?: string,
    public readonly kind: "plugin" | "timeout" | "crashed" | "unavailable" | "busy" = "plugin",
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

export interface SandboxSpec {
  code: string;
  /** extracted package directory */
  dir: string;
  entry: string;
  allowedHosts: string[];
}

interface Pending {
  resolve(value: unknown): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout;
}

type Op = "probe" | "invoke" | "callbackKeys";

export interface CallOptions {
  config?: ConnectorConfig;
  method?: string;
  args?: unknown[];
  timeoutMs?: number;
}

export class PluginSandbox {
  private child: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private crashes: number[] = [];
  private cooldownUntil = 0;
  private disposed = false;
  private secrets = new Set<string>();

  constructor(readonly spec: SandboxSpec) {}

  get inflight(): number {
    return this.pending.size;
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed;
  }

  async call<T>(op: Op, opts: CallOptions = {}): Promise<T> {
    if (this.disposed) {
      throw new SandboxError(`Connector ${this.spec.code} đã được gỡ`, undefined, "unavailable");
    }
    if (Date.now() < this.cooldownUntil) {
      throw new SandboxError(
        `Connector ${this.spec.code} tạm ngắt sau nhiều lần sập tiến trình`,
        undefined,
        "unavailable",
      );
    }
    if (this.pending.size >= MAX_INFLIGHT) {
      throw new SandboxError(`Connector ${this.spec.code} đang quá tải`, undefined, "busy");
    }
    if (opts.config) this.remember(opts.config);
    await this.start();
    const child = this.child!;
    const id = ++this.seq;
    const timeoutMs = Math.max(1000, opts.timeoutMs ?? 30_000);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The process may be stuck (sync loop) — kill it; the next call starts a fresh one.
        this.fail(
          new SandboxError(
            `Connector ${this.spec.code} không phản hồi sau ${timeoutMs} ms`,
            undefined,
            "timeout",
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      child.send(
        { type: "call", id, op, config: opts.config, method: opts.method, args: opts.args ?? [] },
        (err) => {
          if (err) this.settle(id, new SandboxError(`IPC: ${err.message}`, undefined, "crashed"));
        },
      );
    });
  }

  /** Stop accepting calls; kill the process once in-flight calls finish (≤ graceMs). */
  dispose(graceMs = 30_000): void {
    this.disposed = true;
    const child = this.child;
    if (!child) return;
    const started = Date.now();
    const tick = setInterval(() => {
      if (this.pending.size === 0 || Date.now() - started > graceMs) {
        clearInterval(tick);
        this.fail(new SandboxError(`Connector ${this.spec.code} đã được gỡ`), child);
      }
    }, 200);
    tick.unref();
  }

  private remember(config: ConnectorConfig): void {
    for (const s of [config.apiKey, config.secretKey]) {
      if (s && s.length >= 4) this.secrets.add(s);
    }
    if (this.secrets.size > 50) {
      this.secrets = new Set([...this.secrets].slice(-50));
    }
  }

  private redact(line: string): string {
    let out = line.length > LOG_LINE_MAX ? `${line.slice(0, LOG_LINE_MAX)}…` : line;
    for (const s of this.secrets) out = out.split(s).join("••••");
    return out;
  }

  private start(): Promise<void> {
    if (this.ready && this.running) return this.ready;
    // The permission model compares real paths (macOS: /var → /private/var).
    const host = realpathSync(sandboxHostPath());
    const dir = realpathSync(this.spec.dir);
    const child = fork(host, [], {
      execPath: process.execPath,
      execArgv: [
        "--permission",
        `--allow-fs-read=${host}`,
        `--allow-fs-read=${dir}`,
        `--max-old-space-size=${MAX_HEAP_MB}`,
        "--disallow-code-generation-from-strings",
      ],
      env: { NODE_ENV: process.env.NODE_ENV ?? "production", TZ: process.env.TZ ?? "UTC" },
      cwd: dir,
      serialization: "advanced",
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    this.child = child;
    for (const [stream, log] of [
      [child.stdout, console.log],
      [child.stderr, console.error],
    ] as const) {
      if (!stream) continue;
      createInterface({ input: stream }).on("line", (line) =>
        log(`[connector:${this.spec.code}] ${this.redact(line)}`),
      );
    }

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new SandboxError(`Connector ${this.spec.code} không khởi động được`));
        this.fail(new SandboxError("start timeout", undefined, "crashed"), child);
      }, START_TIMEOUT_MS);
      child.on("message", (raw: unknown) => {
        const msg = raw as {
          type?: string;
          id?: number;
          ok?: boolean;
          value?: unknown;
          error?: { message?: string; code?: string };
        };
        if (msg?.type === "ready") {
          clearTimeout(timer);
          resolve();
        } else if (msg?.type === "fatal") {
          clearTimeout(timer);
          const e = new SandboxError(
            `Plugin ${this.spec.code} lỗi: ${msg.error?.message ?? "?"}`,
            undefined,
            "crashed",
          );
          reject(e);
          this.fail(e, child);
        } else if (msg?.type === "result" && typeof msg.id === "number") {
          if (msg.ok) this.settle(msg.id, null, msg.value);
          else
            this.settle(
              msg.id,
              new SandboxError(msg.error?.message ?? "Plugin error", msg.error?.code, "plugin"),
            );
        }
      });
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        reject(new SandboxError(`Plugin ${this.spec.code} thoát (${signal ?? code})`));
        if (this.child === child) {
          this.child = null;
          this.ready = null;
        }
        // Crashes and kills after a timeout both count towards the crash-loop breaker.
        if (!this.disposed) this.noteCrash(code, signal);
        this.rejectAll(
          new SandboxError(
            `Tiến trình connector ${this.spec.code} dừng (${signal ?? code})`,
            undefined,
            "crashed",
          ),
        );
      });
      child.on("error", (err) => {
        console.error(`[connector:${this.spec.code}] process error: ${err.message}`);
      });
      child.send({
        type: "init",
        dir,
        entry: this.spec.entry,
        allowedHosts: this.spec.allowedHosts,
      });
    });
    // Avoid an unhandled rejection when nobody awaits a failed start.
    this.ready.catch(() => {});
    return this.ready;
  }

  private noteCrash(code: number | null, signal: NodeJS.Signals | null): void {
    const now = Date.now();
    this.crashes = [...this.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
    console.error(
      `[connector:${this.spec.code}] sandbox process exited (${signal ?? code}) — ${this.crashes.length} in ${CRASH_WINDOW_MS / 1000}s`,
    );
    if (this.crashes.length >= CRASH_LIMIT) {
      this.cooldownUntil = now + CRASH_COOLDOWN_MS;
      this.crashes = [];
      console.error(
        `[connector:${this.spec.code}] too many crashes — calls refused for ${CRASH_COOLDOWN_MS / 1000}s`,
      );
    }
  }

  private settle(id: number, err: Error | null, value?: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (err) p.reject(err);
    else p.resolve(value);
  }

  private rejectAll(err: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, err);
  }

  /** Kill the process (default: current) and fail every pending call. */
  private fail(err: Error, child: ChildProcess | null = this.child): void {
    if (child && child.exitCode === null) child.kill("SIGKILL");
    if (child === this.child) {
      this.child = null;
      this.ready = null;
    }
    this.rejectAll(err);
  }
}
