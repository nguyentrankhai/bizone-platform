#!/usr/bin/env node
// P6.5 — Đo thời gian phản hồi API (P50 / P95 / max) của các màn hình chính.
//
//   node scripts/perf/bench.mjs [--url http://localhost:3001] [--tenant tenant_perf]
//        [--runs 40] [--concurrency 4] [--only product.list,dashboard.summary] [--json out.json]
//
// Gọi tRPC qua HTTP như trình duyệt (superjson GET, header X-Tenant-ID, token dev-bypass — chỉ
// chạy với server dev / build cục bộ có AUTH_DEV_BYPASS=true). Mỗi endpoint chạy `runs` lần với
// các input xoay vòng (trang, từ khoá khác nhau) để đo cả trường hợp cache trúng lẫn trượt.
// Giới hạn 100 req/phút / user của API được xoá trước mỗi endpoint (khoá `rl:*` của tenant đo).
import Redis from "ioredis";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith("--") ? (i++, next) : "true";
}
const BASE = args.url ?? "http://localhost:3001";
const TENANT = args.tenant ?? "tenant_perf";
const RUNS = Number(args.runs ?? 40);
const CONCURRENCY = Number(args.concurrency ?? 4);
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const TOKEN = args.token ?? "dev-bypass";

const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const vnDaysAgo = (n) =>
  new Date(Date.now() + 7 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const words = [
  "áo",
  "quần",
  "sữa",
  "PF0012",
  "cà phê",
  "son",
  "tai nghe",
  "8930000004",
  "mì",
  "bút",
];
const names = ["Nguyễn", "0900001", "Lan", "KHP0004", "Trần Thị", "Tuấn", "0900123", "Yến"];

/** name → (i) => [procedure, input] */
const CASES = {
  "dashboard.summary": () => ["dashboard.summary", undefined],
  "product.list": (i) => ["product.list", { page: 1 + (i % 10), pageSize: 20 }],
  "product.list+search": (i) => [
    "product.list",
    { page: 1, pageSize: 20, search: words[i % words.length] },
  ],
  "productSearch.search": (i) => [
    "productSearch.search",
    { q: words[i % words.length], limit: 20 },
  ],
  "pos.catalog": (i) => ["pos.catalog", { branchId: 1, page: 1 + (i % 5), pageSize: 48 }],
  "pos.catalog+search": (i) => [
    "pos.catalog",
    { branchId: 1, search: words[i % words.length], pageSize: 48 },
  ],
  "pos.invoices": (i) => ["pos.invoices", { page: 1 + (i % 10), pageSize: 20 }],
  "order.list": (i) => ["order.list", { page: 1 + (i % 10), limit: 20 }],
  "order.list+search": (i) => [
    "order.list",
    { page: 1, limit: 20, search: ["ORDP-0000", "Khách 12", "0800000"][i % 3] },
  ],
  "customer.list": (i) => ["customer.list", { page: 1 + (i % 10), limit: 20 }],
  "customer.list+search": (i) => [
    "customer.list",
    { page: 1, limit: 20, search: names[i % names.length] },
  ],
  "pos.customers": (i) => ["pos.customers", { q: names[i % names.length] }],
  "inventory.list": (i) => ["inventory.list", { page: 1 + (i % 10), pageSize: 20 }],
  "inventory.list+low": () => ["inventory.list", { lowStock: true, page: 1, pageSize: 20 }],
  "auditLog.list": (i) => ["auditLog.list", { page: 1 + (i % 10), limit: 20 }],
  "reports.revenue(30d)": () => ["reports.revenue", { from: vnDaysAgo(29), to: vnToday() }],
  "reports.revenue(365d)": () => ["reports.revenue", { from: vnDaysAgo(364), to: vnToday() }],
  "reports.products(30d)": () => ["reports.products", { from: vnDaysAgo(29), to: vnToday() }],
  "reports.profit(30d)": () => ["reports.profit", { from: vnDaysAgo(29), to: vnToday() }],
  "reports.staff(30d)": () => ["reports.staff", { from: vnDaysAgo(29), to: vnToday() }],
  "reports.branches(30d)": () => ["reports.branches", { from: vnDaysAgo(29), to: vnToday() }],
  "reports.inventory": () => ["reports.inventory", {}],
  "accounting.profitLoss(30d)": () => [
    "accounting.profitLoss",
    { from: vnDaysAgo(29), to: vnToday() },
  ],
};

function url(proc, input) {
  const q =
    input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  return `${BASE}/api/trpc/${proc}${q}`;
}

async function call(proc, input) {
  const t = performance.now();
  const res = await fetch(url(proc, input), {
    headers: { "X-Tenant-ID": TENANT, Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.text();
  const ms = performance.now() - t;
  if (!res.ok) throw new Error(`${proc} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  return { ms, bytes: body.length };
}

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const redis = new Redis(process.env.REDIS_URL ?? "redis://:123456@localhost:6379");
async function clearRateLimit() {
  const keys = await redis.keys(`rl:*:${TENANT}:*`);
  if (keys.length) await redis.del(...keys);
}

const results = [];
for (const [name, make] of Object.entries(CASES)) {
  if (ONLY && !ONLY.has(name)) continue;
  await clearRateLimit();
  const times = [];
  let bytes = 0;
  let first = 0;
  try {
    // lần đầu đo riêng (cache lạnh với input này)
    const r0 = await call(...make(0));
    first = r0.ms;
    let next = 1;
    const worker = async () => {
      while (next < RUNS) {
        const i = next++;
        const r = await call(...make(i));
        times.push(r.ms);
        bytes = r.bytes;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    results.push({ name, error: e.message });
    continue;
  }
  times.sort((a, b) => a - b);
  const row = {
    name,
    first: Math.round(first),
    p50: Math.round(pct(times, 50)),
    p95: Math.round(pct(times, 95)),
    max: Math.round(times.at(-1)),
    kb: Math.round(bytes / 102.4) / 10,
  };
  results.push(row);
  console.log(
    `${row.p95 < 200 ? "✓" : "✗"} ${name.padEnd(24)} first ${String(row.first).padStart(5)} ms · p50 ${String(row.p50).padStart(4)} · p95 ${String(row.p95).padStart(4)} · max ${String(row.max).padStart(5)} ms · ${row.kb} KB`,
  );
}
await clearRateLimit();
await redis.quit();

const ok = results.filter((r) => !r.error);
const all = ok.flatMap((r) => [r.p95]).sort((a, b) => a - b);
console.log(
  `\n${ok.length}/${results.length} endpoint · ${RUNS} lần · ${CONCURRENCY} song song · P95 cao nhất ${all.at(-1)} ms · ${ok.filter((r) => r.p95 < 200).length} đạt < 200 ms`,
);
if (args.json) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    args.json,
    JSON.stringify(
      { at: new Date().toISOString(), base: BASE, runs: RUNS, concurrency: CONCURRENCY, results },
      null,
      2,
    ),
  );
}
