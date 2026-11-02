# BizOne Payment Hub

NextJS 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui, with a BullMQ worker and a WebSocket relay. Scaffolded per `PLAN.md` task P1.2.

## Processes

| Process  | Entry                                    | Port | Role                                                  |
| -------- | ---------------------------------------- | ---- | ----------------------------------------------------- |
| app      | Next.js (`app/`)                         | 4000 | Admin UI + REST API (`/api/*`)                        |
| worker   | `services/worker.ts` → `dist/worker.js`  | —    | BullMQ jobs (queue `webhook-delivery`)                |
| realtime | `server/ws/server.ts` → `dist/server.js` | 4001 | WebSocket `/ws`, relays Redis channel `payhub:events` |

Next.js Route Handlers can't hold WebSocket connections, so realtime runs as its own process. The app publishes with `publishEvent()` (`lib/events.ts`), and the relay broadcasts to every connected client.

## Setup

```bash
cp .env.example .env.local   # fill values from ../../documents/env.txt
npm install
npm run dev                  # app      → http://localhost:4000
npm run dev:worker           # worker   (separate terminal)
npm run dev:realtime         # realtime → ws://localhost:4001/ws
```

Health checks: `GET /api/health` (checks MariaDB + Redis, 503 if either is down) and `GET :4001/health`.

## Scripts

| Script                            | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `npm run dev` / `build` / `start` | Next.js app on port 4000                   |
| `npm run dev:worker`              | BullMQ worker with reload (tsx)            |
| `npm run dev:realtime`            | WebSocket relay with reload (tsx)          |
| `npm run build:jobs`              | Bundle worker + relay to `dist/` (esbuild) |
| `npm run lint` / `typecheck`      | ESLint / `tsc --noEmit`                    |
| `npm run format` / `format:check` | Prettier                                   |

## Docker

```bash
docker compose up -d --build   # app :4000, realtime :4001, worker, MariaDB 10.11 :3308, Redis 7 :6381
docker compose down            # add -v to drop db/cache volumes
```

One image runs all three processes; `worker` and `realtime` override the command.

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
