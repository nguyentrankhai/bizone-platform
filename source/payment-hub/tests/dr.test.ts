import { describe, expect, it, vi } from "vitest";
import { redisRetryOptions } from "@/lib/redis";
import {
  SentryReporter,
  buildEvent,
  parseDsn,
  parseStack,
  scrubText,
  type SentryDsn,
} from "@/lib/sentry";
import {
  applyProbe,
  emptyState,
  interpretHealth,
  parseTargets,
  pruneDays,
  vnDay,
  windowReport,
  type MonitorOptions,
  type ProbeResult,
} from "@/lib/uptime";
import { canonicalQuery, signS3Request } from "@/lib/storage";
import { isInfraError, serviceUnavailable } from "@/server/middleware/degrade";
import { heartbeatKey, heartbeatTtlMs } from "@/lib/heartbeat";

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
const { overallStatus, publicView, staleTasks, healthThresholds } =
  await import("@/server/services/health.service");
const { healthTripThreshold } = await import("@/server/services/connector.service");

// ─── Health aggregation ───────────────────────────────────────────────────────

describe("health status", () => {
  it("only the database can take the service down", () => {
    expect(overallStatus({ database: { status: "ok" }, redis: { status: "ok" } })).toBe("ok");
    expect(overallStatus({ database: { status: "down" }, redis: { status: "ok" } })).toBe("down");
    // a non-critical component reporting "down" still only degrades the service
    expect(overallStatus({ database: { status: "ok" }, redis: { status: "down" } })).toBe(
      "degraded",
    );
    expect(overallStatus({ database: { status: "ok" }, workers: { status: "degraded" } })).toBe(
      "degraded",
    );
  });

  it("public view hides messages and details", () => {
    const view = publicView({
      status: "degraded",
      service: "payment-hub",
      version: null,
      uptimeS: 1,
      checkedAt: "x",
      checks: {
        database: { status: "ok", latencyMs: 2 },
        workers: { status: "degraded", message: "0 worker", details: { live: 0 } },
      },
    });
    expect(view.checks.workers).toEqual({ status: "degraded" });
    expect(view.checks.database).toEqual({ status: "ok", latencyMs: 2 });
  });

  it("flags interval jobs that stopped running (cron jobs ignored)", () => {
    const now = Date.parse("2026-11-21T10:00:00Z");
    const fresh = { "webhook-outbox": String(now - 30_000), expiry: String(now - 60_000) };
    const stale = staleTasks({ ...fresh, "connector-health": String(now - 400_000) }, now);
    expect(stale).toEqual([]);
    const s = staleTasks({ expiry: String(now - 10 * 60_000) }, now);
    expect(s.map((x) => x.task).sort()).toEqual(["connector-health", "expiry", "webhook-outbox"]);
    expect(s.find((x) => x.task === "expiry")?.ageS).toBe(600);
    expect(s.find((x) => x.task === "webhook-outbox")?.ageS).toBeNull();
    expect(s.some((x) => x.task === "retention" || x.task === "archive")).toBe(false);
    // a 5-minute task that has not run yet right after the worker scheduled it is not stalled
    const justScheduled = { ...fresh, _scheduledAt: String(now - 90_000) };
    expect(staleTasks(justScheduled, now)).toEqual([]);
    const longAgo = { ...fresh, _scheduledAt: String(now - 3 * 3_600_000) };
    expect(staleTasks(longAgo, now)).toEqual([{ task: "connector-health", ageS: null }]);
  });

  it("thresholds come from env with defaults", () => {
    expect(healthThresholds({})).toMatchObject({
      minWorkers: 1,
      queueBacklog: 5000,
      backupMonitor: false,
      backupMaxAgeH: 26,
    });
    expect(healthThresholds({ BACKUP_MONITOR: "true", HEALTH_MIN_WORKERS: "2" })).toMatchObject({
      backupMonitor: true,
      minWorkers: 2,
    });
  });

  it("heartbeats use one key per role (cluster-safe) and a 30 s TTL", () => {
    expect(heartbeatKey("worker")).toBe("payhub:{hb}:worker");
    expect(heartbeatTtlMs({})).toBe(30_000);
    expect(heartbeatTtlMs({ HEARTBEAT_TTL_S: "45" })).toBe(45_000);
  });

  it("connector health trip threshold", () => {
    expect(healthTripThreshold({})).toBe(3);
    expect(healthTripThreshold({ CONNECTOR_HEALTH_TRIP_AFTER: "0" })).toBe(0);
    expect(healthTripThreshold({ CONNECTOR_HEALTH_TRIP_AFTER: "x" })).toBe(3);
  });
});

// ─── Redis fail-fast ──────────────────────────────────────────────────────────

describe("redis retry options", () => {
  it("request paths fail fast, BullMQ / subscribers wait", () => {
    expect(redisRetryOptions("blocking")).toEqual({ maxRetriesPerRequest: null });
    expect(redisRetryOptions("command", {})).toEqual({
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
    });
    expect(
      redisRetryOptions("command", { REDIS_MAX_RETRIES: "0", REDIS_COMMAND_TIMEOUT_MS: "500" }),
    ).toEqual({ maxRetriesPerRequest: 0, commandTimeout: 500 });
  });
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

describe("infrastructure errors", () => {
  it("recognises DB / Redis outages, not business errors", () => {
    expect(isInfraError(Object.assign(new Error("x"), { code: "P1001" }))).toBe(true);
    expect(
      isInfraError(Object.assign(new Error("x"), { name: "PrismaClientInitializationError" })),
    ).toBe(true);
    expect(isInfraError(new Error("pool timeout: failed to retrieve a connection from pool"))).toBe(
      true,
    );
    expect(isInfraError(Object.assign(new Error("connect"), { code: "ECONNREFUSED" }))).toBe(true);
    const redis = new Error("Reached the max retries per request limit (which is 1).");
    redis.name = "MaxRetriesPerRequestError";
    expect(isInfraError(redis)).toBe(true);
    expect(isInfraError(new Error("Command timed out"))).toBe(true);
    expect(
      isInfraError(
        new Error("wrapped", { cause: Object.assign(new Error("x"), { code: "ETIMEDOUT" }) }),
      ),
    ).toBe(true);
    // business errors are not
    expect(isInfraError(Object.assign(new Error("dup"), { code: "P2002" }))).toBe(false);
    expect(isInfraError(new Error("Unsupported payment_method"))).toBe(false);
    expect(isInfraError(null)).toBe(false);
  });

  it("503 carries Retry-After and the error format", async () => {
    const r = serviceUnavailable();
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("30");
    expect(await r.json()).toMatchObject({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });
});

// ─── Sentry ───────────────────────────────────────────────────────────────────

describe("sentry reporter", () => {
  const dsn = parseDsn("https://abc123@o1.ingest.sentry.io/4507") as SentryDsn;

  it("parses DSNs (incl. path prefix) and rejects bad ones", () => {
    expect(dsn).toMatchObject({
      publicKey: "abc123",
      envelopeUrl: "https://o1.ingest.sentry.io/api/4507/envelope/",
    });
    expect(parseDsn("http://k@localhost:9000/sentry/12")?.envelopeUrl).toBe(
      "http://localhost:9000/sentry/api/12/envelope/",
    );
    expect(parseDsn("")).toBeNull();
    expect(parseDsn("https://o1.ingest.sentry.io/4507")).toBeNull(); // no key
    expect(parseDsn("not a url")).toBeNull();
  });

  it("scrubs credentials and secrets from free text", () => {
    expect(scrubText("connect mysql://root:mypass@db:3306/paymentdb failed")).toBe(
      "connect mysql://root:••••@db:3306/paymentdb failed",
    );
    expect(scrubText("bad api_key=sk_live_123 and secret: abc, ok")).toBe(
      "bad api_key=•••• and secret: ••••, ok",
    );
    expect(scrubText("Authorization: Bearer eyJhbGciOi.xx.yy")).toContain("••••");
    expect(scrubText("Authorization: Bearer eyJhbGciOi.xx.yy")).not.toContain("eyJ");
  });

  it("builds an event without secrets, query strings or sensitive headers", () => {
    const err = new Error("boom redis://:123456@cache:6379");
    const e = buildEvent(
      { service: "app", environment: "test", release: "1.0" },
      err,
      {
        tags: { route: "/api/v1/transactions" },
        extra: { merchantId: 1, api_secret: "s3cr3t", nested: { password: "x" } },
        request: {
          method: "POST",
          path: "/api/ipn/vnpay?vnp_SecureHash=deadbeef",
          headers: {
            authorization: "Bearer t",
            "x-api-key": "k",
            cookie: "c",
            "user-agent": "curl",
            "x-signature": "sig",
          },
        },
      },
      undefined,
      1_700_000_000_000,
    );
    const json = JSON.stringify(e);
    expect(json).not.toContain("123456");
    expect(json).not.toContain("s3cr3t");
    expect(json).not.toContain("deadbeef");
    expect(json).not.toContain("Bearer t");
    expect(e.request).toEqual({
      method: "POST",
      url: "/api/ipn/vnpay",
      headers: { "user-agent": "curl" },
    });
    expect(e.extra).toEqual({ merchantId: 1, api_secret: "••••", nested: { password: "••••" } });
    expect(e.tags).toEqual({ service: "app", route: "/api/v1/transactions" });
    expect(e).toMatchObject({
      level: "error",
      environment: "test",
      release: "1.0",
      platform: "node",
    });
    const ex = (e.exception as { values: { type: string; stacktrace: { frames: unknown[] } }[] })
      .values[0];
    expect(ex.type).toBe("Error");
    expect(ex.stacktrace.frames.length).toBeGreaterThan(0);
  });

  it("parses V8 stacks oldest-first, marking node_modules out of app", () => {
    const frames = parseStack(
      "Error: x\n    at handler (/app/server/routes/a.ts:10:5)\n    at run (/app/node_modules/next/x.js:1:2)\n    at /app/lib/b.ts:3:4",
    );
    expect(frames.map((f) => f.lineno)).toEqual([3, 1, 10]);
    expect(frames[1].in_app).toBe(false);
    expect(frames[2]).toMatchObject({
      function: "handler",
      filename: "/app/server/routes/a.ts",
      in_app: true,
    });
  });

  it("sends envelopes, dedupes, rate limits and obeys 429", async () => {
    let now = 1_000_000;
    const bodies: string[] = [];
    let status = 200;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response("{}", { status, headers: { "retry-after": "120" } });
    }) as unknown as typeof fetch;
    const r = new SentryReporter({
      dsn,
      service: "worker",
      maxPerMinute: 3,
      fetchImpl,
      now: () => now,
    });

    expect(r.capture(new Error("a"))).toBeTruthy();
    expect(r.capture(new Error("a"))).toBeNull(); // same error within 60 s
    r.capture(new Error("b"));
    r.capture(new Error("c"));
    expect(r.capture(new Error("d"))).toBeNull(); // 3 / minute
    await r.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [header, item, payload] = bodies[0]
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(item).toEqual({ type: "event" });
    expect(payload.event_id).toBe(header.event_id);
    expect(payload.exception.values[0].value).toBe("a");
    const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(call[0]).toBe(dsn.envelopeUrl);
    expect((call[1].headers as Record<string, string>)["x-sentry-auth"]).toContain(
      "sentry_key=abc123",
    );

    now += 61_000;
    status = 429;
    r.capture(new Error("e"));
    await r.flush();
    now += 60_000; // still inside the 120 s Retry-After
    expect(r.capture(new Error("f"))).toBeNull();
    now += 61_000;
    status = 200;
    expect(r.capture(new Error("g"))).toBeTruthy();
    await r.flush();
  });

  it("never throws when the endpoint is down", async () => {
    const r = new SentryReporter({
      dsn,
      service: "app",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(r.capture(new Error("x"))).toBeTruthy();
    await expect(r.flush()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

// ─── Uptime monitor ───────────────────────────────────────────────────────────

describe("uptime monitor", () => {
  const opts: MonitorOptions = { intervalMs: 30_000, failThreshold: 2, recoverThreshold: 1 };
  const ok: ProbeResult = { status: "ok", httpStatus: 200, latencyMs: 10 };
  const down: ProbeResult = { status: "down", latencyMs: 5000, error: "timeout 5000 ms" };
  const degraded: ProbeResult = {
    status: "degraded",
    httpStatus: 200,
    latencyMs: 20,
    components: ["workers"],
  };
  const T0 = Date.parse("2026-11-21T03:00:00Z"); // 10:00 VN

  it("one failed probe does not page; two do; recovery resolves", () => {
    const s = emptyState();
    expect(applyProbe(s, "app", "u", ok, T0, opts)).toEqual([]);
    expect(applyProbe(s, "app", "u", down, T0 + 30_000, opts)).toEqual([]);
    expect(applyProbe(s, "app", "u", ok, T0 + 60_000, opts)).toEqual([]); // blip
    expect(applyProbe(s, "app", "u", down, T0 + 90_000, opts)).toEqual([]);
    const trig = applyProbe(s, "app", "u", down, T0 + 120_000, opts);
    expect(trig).toHaveLength(1);
    expect(trig[0]).toMatchObject({
      action: "trigger",
      severity: "critical",
      dedupKey: "payment-hub:app:down",
    });
    expect(applyProbe(s, "app", "u", down, T0 + 150_000, opts)).toEqual([]); // no repeat
    const res = applyProbe(s, "app", "u", ok, T0 + 180_000, opts);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ action: "resolve", dedupKey: "payment-hub:app:down" });
    expect(s.incidents[0]).toMatchObject({
      kind: "down",
      startedAt: T0 + 120_000,
      endedAt: T0 + 180_000,
    });
  });

  it("degraded warns, then down replaces it", () => {
    const s = emptyState();
    applyProbe(s, "app", "u", ok, T0, opts);
    applyProbe(s, "app", "u", degraded, T0 + 30_000, opts);
    const w = applyProbe(s, "app", "u", degraded, T0 + 60_000, opts);
    expect(w).toMatchObject([{ action: "trigger", severity: "warning", kind: "degraded" }]);
    expect(w[0].summary).toContain("workers");
    applyProbe(s, "app", "u", down, T0 + 90_000, opts);
    const d = applyProbe(s, "app", "u", down, T0 + 120_000, opts);
    expect(d.map((a) => `${a.action}:${a.kind}`)).toEqual(["resolve:degraded", "trigger:down"]);
  });

  it("accounts downtime per VN day and ignores monitor gaps", () => {
    const s = emptyState();
    // 23:59:30 VN → 00:00:30 VN next day, down
    const late = Date.parse("2026-11-21T16:59:30Z");
    applyProbe(s, "app", "u", ok, late - 30_000, opts);
    applyProbe(s, "app", "u", down, late + 60_000, opts);
    // 90 s gap: 60 s before midnight (VN), 30 s after
    expect(s.days["2026-11-21"].app.down).toBe(60);
    expect(s.days["2026-11-22"].app.down).toBe(30);
    expect(s.days["2026-11-21"].app.up).toBe(0);
    // monitor stopped for 10 min → unknown, not downtime
    applyProbe(s, "app", "u", down, late + 60_000 + 600_000, opts);
    expect(s.days["2026-11-22"].app.unknown).toBe(600);
    expect(vnDay(Date.parse("2026-11-21T17:00:00Z"))).toBe("2026-11-22");
  });

  it("reports uptime against the 99.9 % budget (8.76 h / year)", () => {
    const s = emptyState();
    let t = T0;
    applyProbe(s, "app", "u", ok, t, opts);
    for (let i = 0; i < 100; i++) applyProbe(s, "app", "u", ok, (t += 30_000), opts);
    for (let i = 0; i < 2; i++) applyProbe(s, "app", "u", down, (t += 30_000), opts);
    const day = windowReport(s, "app", 1, t);
    expect(day.observedS).toBe(102 * 30);
    expect(day.downS).toBe(60);
    expect(day.uptimePct).toBeCloseTo(98.0392, 3);
    expect(day.budgetS).toBe(86); // 0.1 % of 86 400 s
    expect(windowReport(s, "app", 365, t).budgetS).toBe(31_536); // 8.76 h
    expect(windowReport(s, "app", 30, t).budgetS).toBe(2592); // 43.2 min
    expect(windowReport(s, "nobody", 30, t).uptimePct).toBeNull();
  });

  it("prunes old days", () => {
    const s = emptyState();
    s.days["2024-01-01"] = { app: { up: 1, degraded: 0, down: 0, unknown: 0 } };
    s.days[vnDay(T0)] = { app: { up: 1, degraded: 0, down: 0, unknown: 0 } };
    pruneDays(s, T0);
    expect(Object.keys(s.days)).toEqual([vnDay(T0)]);
  });

  it("interprets health responses", () => {
    expect(interpretHealth(200, { data: { status: "ok" } })).toEqual({ status: "ok" });
    expect(
      interpretHealth(200, {
        data: {
          status: "degraded",
          checks: { database: { status: "ok" }, redis: { status: "degraded" } },
        },
      }),
    ).toEqual({ status: "degraded", components: ["redis"] });
    expect(interpretHealth(503, null).status).toBe("down");
    expect(interpretHealth(404, null).status).toBe("down");
    expect(interpretHealth(200, { success: true, data: { status: "ok", clients: 0 } }).status).toBe(
      "ok",
    );
  });

  it("parses MONITOR_TARGETS", () => {
    expect(parseTargets("app=http://a:4000/api/v1/health, http://b/health")).toEqual([
      { name: "app", url: "http://a:4000/api/v1/health" },
      { name: "target2", url: "http://b/health" },
    ]);
  });
});

// ─── S3 list signing ──────────────────────────────────────────────────────────

describe("S3 ListObjectsV2 signing", () => {
  it("canonical query is sorted and RFC 3986 encoded", () => {
    expect(
      canonicalQuery({ "max-keys": "1000", "list-type": "2", "continuation-token": "a/b+c=" }),
    ).toBe("continuation-token=a%2Fb%2Bc%3D&list-type=2&max-keys=1000");
    expect(canonicalQuery(undefined)).toBe("");
  });

  it("the query changes the signature", () => {
    const base = {
      method: "GET",
      host: "minio:9000",
      path: "/b",
      body: Buffer.alloc(0),
      now: new Date(0),
    };
    const cfg = { region: "us-east-1", accessKey: "a", secretKey: "s" };
    const plain = signS3Request(cfg, base).authorization;
    const listed = signS3Request(cfg, { ...base, query: { "list-type": "2" } }).authorization;
    expect(plain).not.toBe(listed);
  });
});
