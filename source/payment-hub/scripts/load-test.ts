/**
 * P7.4 load test — Payment Hub. Plain Node (no k6 / artillery to install): run with tsx so the
 * webhook / reconciliation scenarios can reuse the app's services.
 *
 *   npx tsx --env-file=.env.local scripts/load-test.ts <scenario> [--option value …]
 *
 * Scenarios (all data uses merchant codes `LT-…` / partner configs named `LT …`; `cleanup`
 * removes it — prefer a throw-away database, see README "Đo tải"):
 *
 *   api       Merchant API under concurrency: POST /api/v1/transactions, GET /api/v1/transactions/
 *             {id}, GET /api/v1/transactions (list). Options: --concurrency 500 --requests 5000
 *             --targets http://localhost:4000[,http://localhost:4002] (round robin = several app
 *             instances) --merchants 20 --seed 0 (pre-existing transactions, for realistic table
 *             sizes) --mix create:40,get:40,list:20 --method <payment_method> --out result.json
 *   webhooks  N transactions become Success with the webhook outbox set; the worker(s) deliver to
 *             a local sink. Options: --count 10000 --sink-port 4590 --dispatch sweep|direct
 *             --fail-rate 0.05 (first attempt answers 500 → retried) --timeout 900
 *   recon     N VNPay transactions paid yesterday + a mock VNPay `querydr` (latency --latency 80
 *             ms ± 50 %); reconciliation run through the worker queue (API) and from a statement
 *             file (in process). Options: --count 10000 --mock-port 4591 --skip-file
 *             The worker must run with VNPAY_API_URL=http://127.0.0.1:<mock-port>/querydr.
 *   cleanup   Delete every LT-… merchant / partner config and their data.
 */
import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/crypto";
import { issueApiKey } from "@/lib/api-keys";
import { signRequest } from "@/lib/hmac";
import { verifyWebhookSignature } from "@/services/webhook/sender";
import { signPipe } from "@/services/connectors/vnpay/vnpay.util";

// ─── CLI ──────────────────────────────────────────────────────────────────────

const [scenario = "", ...argv] = process.argv.slice(2);
const opts = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const [k, inline] = a.slice(2).split("=", 2);
  if (inline !== undefined) opts.set(k, inline);
  else if (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.set(k, argv[++i]);
  else opts.set(k, "true");
}
const num = (k: string, d: number) => (opts.has(k) ? Number(opts.get(k)) : d);
const str = (k: string, d: string) => opts.get(k) ?? d;

const prisma = getPrisma();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Stats ────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summary(latencies: number[]) {
  const s = [...latencies].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    count: s.length,
    p50: round(percentile(s, 50)),
    p90: round(percentile(s, 90)),
    p95: round(percentile(s, 95)),
    p99: round(percentile(s, 99)),
    max: round(s[s.length - 1] ?? 0),
    mean: round(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ─── Test data ────────────────────────────────────────────────────────────────

interface TestMerchant {
  id: number;
  code: string;
  apiKeyId: number;
  apiKey: string;
  secret: string;
}

/** `count` merchants LT-<tag>-NNN, each with a fresh API key (rate limit high enough for a test). */
async function testMerchants(tag: string, count: number): Promise<TestMerchant[]> {
  const out: TestMerchant[] = [];
  for (let i = 1; i <= count; i++) {
    const code = `LT-${tag}-${String(i).padStart(3, "0")}`;
    const merchant = await prisma.merchant.upsert({
      where: { code },
      update: { status: "Active" },
      create: { code, name: `Load test ${code}`, status: "Active" },
    });
    const issued = issueApiKey();
    const key = await prisma.apiKey.create({
      data: {
        merchantId: merchant.id,
        apiKey: issued.apiKey,
        apiSecret: issued.storedSecret,
        name: `load-test ${new Date().toISOString()}`,
        rateLimit: 1_000_000,
      },
    });
    out.push({
      id: merchant.id,
      code,
      apiKeyId: key.id,
      apiKey: issued.apiKey,
      secret: issued.apiSecret,
    });
  }
  return out;
}

function txnCode(i: number, day = new Date()): string {
  const d = day.toISOString().slice(0, 10).replace(/-/g, "");
  return `TXN-${d}-${String(i % 1_000_000).padStart(6, "0")}`;
}

/** Bulk insert (createMany in chunks) — returns nothing; callers query back what they need. */
async function insertTransactions(rows: Prisma.TransactionCreateManyInput[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.transaction.createMany({ data: rows.slice(i, i + 2000) });
  }
}

// ─── Scenario: api ────────────────────────────────────────────────────────────

type Op = "create" | "get" | "list";

async function scenarioApi(): Promise<void> {
  const concurrency = num("concurrency", 500);
  const total = num("requests", concurrency * 10);
  const targets = str("targets", "http://localhost:4000").split(",").filter(Boolean);
  const method = opts.get("method");
  const mix = new Map<Op, number>(
    str("mix", "create:40,get:40,list:20")
      .split(",")
      .map((p) => p.split(":") as [Op, string])
      .map(([k, v]) => [k, Number(v)]),
  );
  const merchants = await testMerchants("API", num("merchants", 20));

  // Existing rows (realistic table sizes + ids for GET)
  const seed = num("seed", 0);
  if (seed > 0) {
    const t0 = Date.now();
    const base = Math.floor(Math.random() * 900_000);
    const rows: Prisma.TransactionCreateManyInput[] = [];
    for (let i = 0; i < seed; i++) {
      const m = merchants[i % merchants.length];
      const created = new Date(Date.now() - Math.random() * 300 * 86400_000);
      rows.push({
        txnCode: `${txnCode(base + i, created)}-S${i}`,
        merchantId: m.id,
        merchantTxnId: `LT-SEED-${randomUUID()}`,
        amount: 10_000 + (i % 500) * 1000,
        status: (["Success", "Failed", "Expired", "Success"] as const)[i % 4],
        createdAt: created,
        paidAt: i % 4 === 0 || i % 4 === 3 ? created : null,
      });
    }
    await insertTransactions(rows);
    console.log(`[api] seeded ${seed} transactions in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const ids = new Map<number, number[]>();
  for (const m of merchants) {
    const rows = await prisma.transaction.findMany({
      where: { merchantId: m.id },
      select: { id: true },
      orderBy: { id: "desc" },
      take: 500,
    });
    ids.set(
      m.id,
      rows.map((r) => r.id),
    );
  }

  const pickOp = (): Op => {
    const sum = [...mix.values()].reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (const [op, w] of mix) if ((r -= w) < 0) return op;
    return "create";
  };

  const lat: Record<Op, number[]> = { create: [], get: [], list: [] };
  const all: number[] = [];
  const statuses = new Map<string, number>();
  let issued = 0;
  let seq = 0;

  async function call(): Promise<void> {
    const m = merchants[Math.floor(Math.random() * merchants.length)];
    let op = pickOp();
    if (op === "get" && !ids.get(m.id)?.length) op = "create";
    let path: string;
    let body = "";
    let httpMethod: "GET" | "POST" = "GET";
    if (op === "create") {
      httpMethod = "POST";
      path = "/api/v1/transactions";
      body = JSON.stringify({
        merchant_txn_id: `LT-${Date.now()}-${seq++}-${randomBytes(3).toString("hex")}`,
        amount: 10_000 + Math.floor(Math.random() * 1000) * 1000,
        description: "Load test",
        ...(method ? { payment_method: method } : {}),
      });
    } else if (op === "get") {
      const list = ids.get(m.id)!;
      path = `/api/v1/transactions/${list[Math.floor(Math.random() * list.length)]}`;
    } else {
      path = `/api/v1/transactions?page=${1 + Math.floor(Math.random() * 3)}&limit=20`;
    }
    const ts = String(Math.floor(Date.now() / 1000));
    const target = targets[issued % targets.length];
    const t0 = performance.now();
    let status = "ERR";
    try {
      const res = await fetch(target + path, {
        method: httpMethod,
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": m.apiKey,
          "X-Timestamp": ts,
          "X-Signature": signRequest(m.secret, httpMethod, path, ts, body),
          ...(op === "create" ? { "Idempotency-Key": randomUUID() } : {}),
        },
        body: httpMethod === "POST" ? body : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      status = String(res.status);
      const json = (await res.json().catch(() => null)) as {
        data?: { transaction_id?: number };
      } | null;
      if (op === "create" && res.status === 201 && json?.data?.transaction_id) {
        ids.get(m.id)!.push(json.data.transaction_id);
      }
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      status = `ERR:${err.cause?.code ?? err.name}`;
    }
    const ms = performance.now() - t0;
    lat[op].push(ms);
    all.push(ms);
    statuses.set(`${op}:${status}`, (statuses.get(`${op}:${status}`) ?? 0) + 1);
  }

  console.log(
    `[api] ${total} requests, ${concurrency} concurrent, targets ${targets.join(" ")}, mix ${str("mix", "create:40,get:40,list:20")}`,
  );
  const started = performance.now();
  // Closed loop: `concurrency` requests in flight at every moment. Clients join over --ramp-ms
  // (default 1000): opening hundreds of TCP connections in the same millisecond overflows the
  // listen backlog of a dev machine (macOS kern.ipc.somaxconn = 128 → ECONNRESET), which a
  // reverse proxy with keep-alive upstreams never does in production.
  const ramp = num("ramp-ms", 1000);
  let inFlight = 0;
  let maxInFlight = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      if (ramp > 0) await sleep((w / concurrency) * ramp);
      while (issued < total) {
        issued++;
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await call();
        inFlight--;
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;

  const errors = [...statuses].filter(([k]) => !/:(200|201)$/.test(k));
  const result = {
    scenario: "api",
    concurrency,
    requests: total,
    targets,
    rampMs: ramp,
    maxInFlight,
    seconds: Math.round(seconds * 10) / 10,
    rps: Math.round(total / seconds),
    overall: summary(all),
    byOp: Object.fromEntries((Object.keys(lat) as Op[]).map((k) => [k, summary(lat[k])])),
    statuses: Object.fromEntries(statuses),
    errors: errors.reduce((a, [, n]) => a + n, 0),
    p95Under1s:
      percentile(
        [...all].sort((a, b) => a - b),
        95,
      ) < 1000,
  };
  console.log(JSON.stringify(result, null, 2));
  if (opts.has("out")) writeFileSync(str("out", ""), JSON.stringify(result, null, 2));
}

// ─── Scenario: webhooks ───────────────────────────────────────────────────────

async function scenarioWebhooks(): Promise<void> {
  const count = num("count", 10_000);
  const port = num("sink-port", 4590);
  const failRate = num("fail-rate", 0);
  const dispatch = str("dispatch", "sweep");
  // One merchant per run: endpoints of earlier runs would receive the same events
  const [merchant] = await testMerchants(`WH${Date.now().toString(36)}`, 1);
  const secret = randomBytes(32).toString("hex");
  const config = await prisma.webhookConfig.create({
    data: {
      merchantId: merchant.id,
      url: `http://127.0.0.1:${port}/hook`,
      secret: encryptSecret(secret),
      events: ["payment.success"],
      retryCount: 3,
      retryIntervals: [1, 2, 4],
      timeoutMs: 10_000,
    },
  });

  // Sink: counts deliveries per X-Webhook-Id, checks every signature
  const seen = new Map<string, number>();
  let requests = 0;
  let badSignatures = 0;
  let failedOnPurpose = 0;
  let firstAt = 0;
  let lastAt = 0;
  const sink: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      requests++;
      const body = Buffer.concat(chunks).toString("utf8");
      const id = String(req.headers["x-webhook-id"] ?? "");
      const ok = verifyWebhookSignature(
        secret,
        String(req.headers["x-timestamp"] ?? ""),
        body,
        String(req.headers["x-signature"] ?? ""),
      );
      if (!ok) badSignatures++;
      // Deterministic share of deliveries fail on their first attempt (exercise retries)
      const firstAttempt = !seen.has(id) && !failedIds.has(id);
      if (firstAttempt && failRate > 0 && hashShare(id) < failRate) {
        failedIds.add(id);
        failedOnPurpose++;
        res.writeHead(500).end("try again");
        return;
      }
      seen.set(id, (seen.get(id) ?? 0) + 1);
      firstAt ||= Date.now();
      lastAt = Date.now();
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    });
  });
  const failedIds = new Set<string>();
  await new Promise<void>((r) => sink.listen(port, "127.0.0.1", r));

  const t0 = Date.now();
  const day = new Date();
  const base = Math.floor(Math.random() * 900_000);
  const rows: Prisma.TransactionCreateManyInput[] = [];
  const old = new Date(Date.now() - 60_000); // outbox rows older than the sweeper's 10 s guard
  for (let i = 0; i < count; i++) {
    rows.push({
      txnCode: `${txnCode(base + i, day)}-W${i}`,
      merchantId: merchant.id,
      merchantTxnId: `LT-WH-${randomUUID()}`,
      amount: 50_000,
      status: "Success",
      paymentMethod: "vnpay",
      paidAt: old,
      notifyWebhook: true,
      webhookSentAt: null,
      createdAt: old,
      updatedAt: old,
    });
  }
  await insertTransactions(rows);
  const inserted = Date.now();
  console.log(
    `[webhooks] ${count} outbox rows in ${((inserted - t0) / 1000).toFixed(1)} s — dispatch: ${dispatch}`,
  );

  if (dispatch === "direct") {
    const { dispatchTransactionWebhook } = await import("@/server/services/webhook.service");
    const txns = await prisma.transaction.findMany({
      where: { merchantId: merchant.id, notifyWebhook: true, webhookSentAt: null },
      select: { id: true },
    });
    await mapLimit(txns, 50, (t) => dispatchTransactionWebhook(t.id));
    console.log(`[webhooks] enqueued in ${((Date.now() - inserted) / 1000).toFixed(1)} s`);
  }

  const deadline = Date.now() + num("timeout", 900) * 1000;
  let lastLog = 0;
  while (seen.size < count && Date.now() < deadline) {
    await sleep(500);
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      console.log(`[webhooks] delivered ${seen.size}/${count} (${requests} HTTP requests)`);
    }
  }
  await sleep(2000); // late duplicates, final webhook_logs rows
  const done = Date.now();
  const duplicates = [...seen.values()].filter((n) => n > 1).length;
  const logs = await prisma.webhookLog.groupBy({
    by: ["status"],
    where: { webhookConfigId: config.id },
    _count: { _all: true },
  });
  const claimed = await prisma.transaction.count({
    where: { merchantId: merchant.id, webhookSentAt: { not: null } },
  });
  const result = {
    scenario: "webhooks",
    count,
    dispatch,
    failRate,
    delivered: seen.size,
    httpRequests: requests,
    failedOnPurpose,
    duplicates,
    badSignatures,
    outboxClaimed: claimed,
    webhookLogs: Object.fromEntries(logs.map((l) => [l.status, l._count._all])),
    secondsTotal: Math.round((done - inserted) / 100) / 10,
    secondsFirstToLast: Math.round((lastAt - firstAt) / 100) / 10,
    perSecond: Math.round(seen.size / ((lastAt - inserted) / 1000 || 1)),
    allDelivered: seen.size === count && duplicates === 0 && badSignatures === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (opts.has("out")) writeFileSync(str("out", ""), JSON.stringify(result, null, 2));
  sink.close();
}

function hashShare(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

// ─── Scenario: recon ──────────────────────────────────────────────────────────

const LT_VNPAY_SECRET = "LTLOADTESTSECRET0123456789ABCDEF";

async function scenarioRecon(): Promise<void> {
  const count = num("count", 10_000);
  const port = num("mock-port", 4591);
  const latency = num("latency", 80);
  const { vnYesterday, vnDayRange, createRun, executeRun, getRun } =
    await import("@/server/services/reconciliation.service");
  const { enqueueReconRun } = await import("@/services/reconciliation/queue");
  const { parseStatement } = await import("@/services/reconciliation/statement");

  const [merchant] = await testMerchants(`RC${Date.now().toString(36)}`, 1);
  const partner = await prisma.partnerConfig.create({
    data: {
      connectorType: "VNPay",
      name: `LT VNPay recon ${new Date().toISOString()}`,
      apiKey: encryptSecret("LTTMN001"),
      secretKey: encryptSecret(LT_VNPAY_SECRET),
      merchantCode: "LTTMN001",
      status: "Inactive", // never routed to — only reconciled
      environment: "Sandbox",
    },
  });

  const day = vnYesterday();
  const { start } = vnDayRange(day);
  const base = Math.floor(Math.random() * 900_000);
  const rows: Prisma.TransactionCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    const at = new Date(start.getTime() + Math.floor((i / count) * 86_000_000));
    rows.push({
      txnCode: txnCode(base + i, at),
      merchantId: merchant.id,
      merchantTxnId: `LT-RC-${randomUUID()}`,
      amount: 10_000 + (i % 900) * 1000,
      status: "Success",
      paymentMethod: "vnpay",
      partnerConfigId: partner.id,
      partnerTxnId: `LT${String(14_000_000 + base + i)}`,
      paidAt: at,
      createdAt: at,
      updatedAt: at,
    });
  }
  await insertTransactions(rows);
  const txns = await prisma.transaction.findMany({
    where: { partnerConfigId: partner.id },
    select: { txnCode: true, amount: true, partnerTxnId: true },
  });
  const byCode = new Map(txns.map((t) => [t.txnCode, t]));
  // Partner side: 0.1 % answer another amount (Amount_Mismatch expected)
  const mismatch = new Set(txns.filter((_, i) => i % 1000 === 7).map((t) => t.txnCode));
  console.log(`[recon] ${count} transactions for ${day}, partner config #${partner.id}`);

  // Mock VNPay querydr — signs the answer like VNPay (HMAC-SHA512 over the pipe-joined fields)
  let queries = 0;
  const mock = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      queries++;
      const q = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<
        string,
        string
      >;
      const t = byCode.get(q.vnp_TxnRef);
      const delay = latency * (0.5 + Math.random());
      setTimeout(() => {
        const data: Record<string, string> = {
          vnp_ResponseId: randomUUID().replace(/-/g, ""),
          vnp_Command: "querydr",
          vnp_ResponseCode: t ? "00" : "91",
          vnp_Message: t ? "QueryDR Success" : "Not found",
          vnp_TmnCode: q.vnp_TmnCode ?? "",
          vnp_TxnRef: q.vnp_TxnRef ?? "",
          vnp_Amount: t
            ? String((Number(t.amount) + (mismatch.has(t.txnCode) ? 1000 : 0)) * 100)
            : "",
          vnp_BankCode: "NCB",
          vnp_PayDate: "",
          vnp_TransactionNo: t?.partnerTxnId ?? "",
          vnp_TransactionType: "01",
          vnp_TransactionStatus: t ? "00" : "",
          vnp_OrderInfo: q.vnp_OrderInfo ?? "",
          vnp_PromotionCode: "",
          vnp_PromotionAmount: "",
        };
        data.vnp_SecureHash = signPipe(
          [
            data.vnp_ResponseId,
            data.vnp_Command,
            data.vnp_ResponseCode,
            data.vnp_Message,
            data.vnp_TmnCode,
            data.vnp_TxnRef,
            data.vnp_Amount,
            data.vnp_BankCode,
            data.vnp_PayDate,
            data.vnp_TransactionNo,
            data.vnp_TransactionType,
            data.vnp_TransactionStatus,
            data.vnp_OrderInfo,
            data.vnp_PromotionCode,
            data.vnp_PromotionAmount,
          ],
          LT_VNPAY_SECRET,
        );
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(data));
      }, delay);
    });
  });
  await new Promise<void>((r) => mock.listen(port, "127.0.0.1", r));

  // 1) API source, through the worker queue (as the admin "Chạy đối soát" button)
  const apiRun = await createRun({
    partnerConfigId: partner.id,
    runDate: day,
    source: "Api",
    triggeredBy: "cli:load-test",
  });
  const t0 = Date.now();
  await enqueueReconRun(apiRun.id);
  let view = await getRun(apiRun.id);
  const deadline = Date.now() + 15 * 60_000;
  while (view.status === "Running" && Date.now() < deadline) {
    await sleep(1000);
    view = await getRun(apiRun.id);
  }
  const apiSeconds = (Date.now() - t0) / 1000;
  console.log(
    `[recon] API run #${apiRun.id}: ${view.status} in ${apiSeconds.toFixed(1)} s (${queries} queries)`,
  );

  // 2) File source (statement CSV of the same day), parsed + matched in process
  let file: Record<string, unknown> | null = null;
  if (!opts.has("skip-file")) {
    const csv = [
      "Mã GD Payment Hub,Số tiền,Trạng thái,Mã GD đối tác",
      ...txns.map(
        (t, i) =>
          `${t.txnCode},${Number(t.amount) + (i % 1000 === 7 ? 1000 : 0)},Thành công,${t.partnerTxnId}`,
      ),
    ].join("\n");
    const f0 = Date.now();
    const parsed = await parseStatement("statement.csv", Buffer.from(csv, "utf8"));
    const fileRun = await createRun({
      partnerConfigId: partner.id,
      runDate: day,
      source: "File",
      sourceFile: "statement.csv",
      triggeredBy: "cli:load-test",
    });
    const fv = await executeRun(fileRun.id, { records: parsed.records });
    file = {
      run: fileRun.id,
      status: fv.status,
      seconds: (Date.now() - f0) / 1000,
      matched: fv.matched_count,
      amountMismatch: fv.amount_mismatch_count,
      unmatchedPaymentHub: fv.unmatched_paymenthub,
      unmatchedPartner: fv.unmatched_partner,
    };
  }

  const result = {
    scenario: "recon",
    count,
    mockLatencyMs: latency,
    api: {
      run: apiRun.id,
      status: view.status,
      seconds: Math.round(apiSeconds * 10) / 10,
      partnerQueries: queries,
      matched: view.matched_count,
      amountMismatch: view.amount_mismatch_count,
      unmatchedPaymentHub: view.unmatched_paymenthub,
      unmatchedPartner: view.unmatched_partner,
      unverified: view.unverified_count,
    },
    file,
    under5Minutes: view.status === "Completed" && apiSeconds < 300,
  };
  console.log(JSON.stringify(result, null, 2));
  if (opts.has("out")) writeFileSync(str("out", ""), JSON.stringify(result, null, 2));
  mock.close();
}

// ─── Scenario: cleanup ────────────────────────────────────────────────────────

async function scenarioCleanup(): Promise<void> {
  const merchants = await prisma.merchant.findMany({
    where: { code: { startsWith: "LT-" } },
    select: { id: true },
  });
  const merchantIds = merchants.map((m) => m.id);
  const partners = await prisma.partnerConfig.findMany({
    where: { name: { startsWith: "LT " } },
    select: { id: true },
  });
  const partnerIds = partners.map((p) => p.id);
  const configs = await prisma.webhookConfig.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true },
  });
  const r = {
    webhookLogs: (
      await prisma.webhookLog.deleteMany({
        where: { webhookConfigId: { in: configs.map((c) => c.id) } },
      })
    ).count,
    reconRuns: (
      await prisma.reconciliationRun.deleteMany({ where: { partnerConfigId: { in: partnerIds } } })
    ).count,
    notifications: (
      await prisma.notification.deleteMany({ where: { merchantId: { in: merchantIds } } })
    ).count,
    transactions: 0,
    archived: (
      await prisma.transactionArchive.deleteMany({ where: { merchantId: { in: merchantIds } } })
    ).count,
  };
  // Children (logs, raw data, QR…) go by FK cascade; chunks keep each DELETE short
  for (;;) {
    const ids = await prisma.transaction.findMany({
      where: { merchantId: { in: merchantIds } },
      select: { id: true },
      take: 5000,
    });
    if (ids.length === 0) break;
    r.transactions += (
      await prisma.transaction.deleteMany({ where: { id: { in: ids.map((t) => t.id) } } })
    ).count;
  }
  await prisma.partnerConfig.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } }); // api keys + configs cascade
  console.log(
    JSON.stringify({ merchants: merchantIds.length, partners: partnerIds.length, ...r }, null, 2),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const scenarios: Record<string, () => Promise<void>> = {
  api: scenarioApi,
  webhooks: scenarioWebhooks,
  recon: scenarioRecon,
  cleanup: scenarioCleanup,
};

const run = scenarios[scenario];
if (!run) {
  console.error(
    `usage: tsx scripts/load-test.ts <${Object.keys(scenarios).join("|")}> [--option value]`,
  );
  process.exit(2);
}
run()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
