# BizOne Payment Hub

NextJS 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui, with a BullMQ worker and a WebSocket relay. Scaffolded per `PLAN.md` task P1.2.

## Processes

| Process  | Entry                                         | Port | Role                                                                          |
| -------- | --------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| app      | Next.js (`app/`)                              | 4000 | Admin UI + REST API (`/api/*`)                                                |
| worker   | `services/worker.ts` → `dist/worker.js`       | —    | BullMQ jobs (webhooks, recon, e-mail, maintenance)                            |
| realtime | `server/ws/server.ts` → `dist/server.js`      | 4001 | WebSocket `/ws`, relays Redis channel `payhub:events`                         |
| monitor  | `services/monitor.ts` → `dist/monitor.mjs`    | 4002 | P7.5 uptime monitor — PagerDuty / e-mail on downtime (run it on another host) |
| backup   | `scripts/backup-cron.sh` (image target `ops`) | —    | P7.5 daily backup + restore test, 30-day retention                            |

Next.js Route Handlers can't hold WebSocket connections, so realtime runs as its own process. The app publishes with `publishEvent()` (`lib/events.ts`), and the relay broadcasts to every connected client.

## Setup

```bash
cp .env.example .env.local   # fill values from ../../documents/env.txt
npm install
npm run dev                  # app      → http://localhost:4000
npm run dev:worker           # worker   (separate terminal)
npm run dev:realtime         # realtime → ws://localhost:4001/ws
```

Health checks (P7.5): `GET /api/v1/health` (monitoring / load balancer — `ok` / `degraded` / `down`, 503 only when the database is down; details with `X-Health-Token`), `GET /api/health` (Docker readiness, same report), `GET /api/health/live` (liveness) and `GET :4001/health` (realtime, 503 without Redis).

## Scripts

| Script                             | Purpose                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`  | Next.js app on port 4000                                                                  |
| `npm run dev:worker`               | BullMQ worker with reload (tsx)                                                           |
| `npm run dev:realtime`             | WebSocket relay with reload (tsx)                                                         |
| `npm run build:jobs`               | Bundle worker, relay, monitor, backup-files to `dist/` (esbuild)                          |
| `npm run dev:monitor`              | Uptime monitor (P7.5) — `node dist/monitor.mjs report` prints uptime vs the 99.9 % budget |
| `npm run backup` / `backup:verify` | Backup DB + files to `./backups` / restore test of the latest set (P7.5)                  |
| `npm run lint` / `typecheck`       | ESLint / `tsc --noEmit`                                                                   |
| `npm run format` / `format:check`  | Prettier                                                                                  |

## Docker

```bash
# P6.6: DB / Redis passwords come from an env file (no defaults in the compose file)
docker compose --env-file ../../.env.development up -d --build   # app :4000, realtime :4001, worker, MariaDB 10.11 :3308, Redis 7 :6381
docker compose down            # add -v to drop db/cache volumes
```

One image runs all three processes; `worker` and `realtime` override the command. `up -d --build`
builds every image (also `migrate` and the `ops` image of `backup`) — building only `app` leaves
the `migrate` image on old migrations.

P7.5 services: `backup` (daily at `BACKUP_TIME` 01:30 VN + restore test, volume `backups`) and
`monitor` (opt-in: `--profile monitoring`). Manual backup / restore inside the stack:

```bash
docker compose --env-file ../../.env.development run --rm backup bash scripts/backup.sh
docker compose --env-file ../../.env.development run --rm backup bash scripts/backup-verify.sh latest
docker compose --env-file ../../.env.development run --rm backup bash scripts/restore.sh latest --target-db paymentdb_new --files
```

## Disaster recovery & monitoring (P7.5)

See [`documents/DR-Runbook-PaymentHub.md`](../../documents/DR-Runbook-PaymentHub.md): RPO / RTO,
backup set layout, encryption (`BACKUP_ENCRYPTION_KEY_FILE`), off-site copy (`BACKUP_UPLOAD_CMD`),
restore procedures, graceful-degradation matrix, restore test plan, alerting (PagerDuty / e-mail /
Sentry `SENTRY_DSN`) and the production checklist.

## Scaling (P7.4)

- **App**: stateless — run several instances behind a load balancer (rate limits, idempotency keys,
  list cache, circuit breakers, connector catalog version all live in the shared Redis).
- **Worker**: `docker compose up -d --scale worker=3` (or `WORKER_REPLICAS`); `WORKER_QUEUES` /
  `WORKER_CONCURRENCY_<QUEUE>` specialise instances. Periodic jobs are BullMQ job schedulers on
  `payhub-maintenance` (one run per tick, Redis lock per task) — not one `setInterval` per process.
- **Redis Cluster**: `REDIS_CLUSTER_NODES=host:port,…` (`lib/redis.ts`); keys used together share a
  hash tag, BullMQ uses the `{payhub}` prefix.
- **DB**: `transactions` stays unpartitioned (unique keys + 7 FKs); final transactions older than
  `TXN_ARCHIVE_MONTHS` (24) move nightly to `transactions_archive`, partitioned by month — see
  `scripts/partition-transactions.sql`.

### Load test

```bash
# throw-away database + Redis DB index recommended (all data uses LT-… merchants)
npx tsx --env-file=.env.local scripts/load-test.ts api --concurrency 500 --requests 5000 \
  --targets http://localhost:4000,http://localhost:4002 --seed 200000
npx tsx --env-file=.env.local scripts/load-test.ts webhooks --count 10000 --fail-rate 0.05   # worker(s) running
VNPAY_API_URL=http://127.0.0.1:4591/querydr npm run dev:worker                               # for recon
npx tsx --env-file=.env.local scripts/load-test.ts recon --count 10000 --latency 80
npx tsx --env-file=.env.local scripts/load-test.ts cleanup
```

## Layout

| Folder               | Contents                                                    |
| -------------------- | ----------------------------------------------------------- |
| `app/`               | Routes, layouts, route handlers                             |
| `components/ui/`     | shadcn/ui components                                        |
| `lib/`               | `db.ts` (MariaDB pool), `redis.ts`, `events.ts`, `utils.ts` |
| `services/queue/`    | BullMQ connection, queue definitions, `enqueueWebhook()`    |
| `services/webhook/`  | Webhook delivery processor (HMAC-SHA256 signed)             |
| `services/worker.ts` | Worker process entry                                        |
| `server/ws/`         | WebSocket relay process                                     |
| `hooks/`, `types/`   | Shared hooks and types                                      |

Outgoing webhooks carry `x-payhub-event`, `x-payhub-delivery`, `x-payhub-timestamp` and `x-payhub-signature = HMAC-SHA256(secret, timestamp + "." + body)`. Failed deliveries retry 5 times with exponential backoff.

Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`).
