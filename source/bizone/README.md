# BizOne Core

NextJS 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui. Scaffolded per `PLAN.md` task P1.1.

## Setup

```bash
cp .env.example .env.local   # fill values from ../../documents/env.txt
npm install
npm run dev                  # http://localhost:3000 (use `npx next dev -p 3010` if 3000 is taken)
```

Health check: `GET /api/health`

## Scripts

| Script                            | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Dev server (Turbopack)                 |
| `npm run build` / `npm start`     | Production build / start               |
| `npm run lint`                    | ESLint                                 |
| `npm run typecheck`               | `tsc --noEmit`                         |
| `npm run format` / `format:check` | Prettier (with Tailwind class sorting) |

## Docker

```bash
docker compose up -d --build              # app :3000, MariaDB 10.11 :3307, Redis 7 :6380
APP_PORT=3010 docker compose up -d --build
docker compose down                       # add -v to drop db/cache volumes
```

Inside the compose network the app reaches the DB at `db:3306` and Redis at `cache:6379`.

## Database (Prisma 7)

`prisma/schema.prisma` mirrors `../../database/schema.sql` (70 tables): PascalCase models and camelCase fields, mapped back to the snake_case table and column names with `@@map`/`@map`.

```bash
npm run db:push      # sync schema to DATABASE_URL (or: npm run db:migrate to apply prisma/migrations)
npm run db:seed      # reference data (roles, permissions, categories, config…); safe to re-run
npm run db:studio    # browse data
DATABASE_URL="mysql://root:mypass@localhost:3307/bizonedb" npx prisma db push   # target another DB
```

In code, use `getPrisma()` from `lib/prisma.ts`. The client is generated into `generated/prisma` (gitignored) by `build`, `typecheck` and `db:generate`.

## Layout

| Folder           | Contents                                       |
| ---------------- | ---------------------------------------------- |
| `app/`           | Routes, layouts, route handlers                |
| `components/ui/` | shadcn/ui components (`npx shadcn add <name>`) |
| `hooks/`         | Shared React hooks                             |
| `lib/`           | Shared utilities                               |
| `server/`        | tRPC routers, services, middleware             |
| `types/`         | Shared TypeScript types                        |

Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`).
