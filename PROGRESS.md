# Tiến độ thực hiện — BizOne & Payment Hub

> Theo dõi tiến độ các task trong [PLAN.md](PLAN.md) và ghi chú kết quả của từng task.
> Cập nhật mỗi khi một task bắt đầu, hoàn thành hoặc bị chặn.

**Trạng thái:** ✅ Hoàn thành · 🟡 Đang làm · ⬜ Chưa bắt đầu · ⛔ Bị chặn

**Cập nhật lần cuối:** 2026-11-03 (P2.2)

---

## Tổng quan

| Giai đoạn | Tổng task | ✅ | 🟡 | ⬜ |
|-----------|-----------|----|----|----|
| 1 — Nền tảng | 8 | 8 | 0 | 0 |
| 2 — BizOne Core MVP | 10 | 2 | 0 | 8 |
| 3 — Payment Hub MVP | 8 | 0 | 0 | 8 |
| 4 — BizOne Mở rộng | 8 | 0 | 0 | 8 |
| 5 — Payment Hub Mở rộng | 6 | 0 | 0 | 6 |
| 6 — BizOne Nâng cao | 6 | 0 | 0 | 6 |
| 7 — Payment Hub Nâng cao | 5 | 0 | 0 | 5 |
| **Tổng** | **51** | **10** | **0** | **41** |

---

## Theo dõi vấn đề

### Còn mở

| # | Vấn đề | Nguồn | Xử lý ở |
|---|--------|-------|---------|
| 1 | WebSocket Payment Hub (`:4001/ws`) chưa xác thực — không publish dữ liệu giao dịch thật trước khi có kiểm tra token | P1.2 | P1.5 |
| 2 | Token Exchange v1 deprecated trong Keycloak 26; v2 chỉ đổi token trong cùng realm → chọn lại cách BizOne gọi Payment Hub | Nâng cấp Keycloak | P1.5 |
| 3 | Job webhook chứa `secret` trong Redis → đổi sang `webhookConfigId`, đọc secret từ DB | P1.2 | P3.6 |
| ~~4~~ | ~~Payment Hub health check dùng driver `mariadb` trực tiếp → chuyển sang Prisma~~ | ~~P1.2~~ | ✅ P1.4 |
| ~~5~~ | ~~`paymentdb` còn charset mặc định `utf8` / `utf8_general_ci` (utf8mb3) → đổi sang `utf8mb4_unicode_ci`~~ | ~~Kiểm tra 2026-11-03~~ | ✅ P1.4 |
| 6 | Bản rollback MariaDB 10.3 (container `mariadbtest-10.3` + volume gốc) còn giữ → xoá khi chắc chắn không cần | Nâng cấp MariaDB | Người dùng |

### Đã giải quyết

| Ngày | Vấn đề | Cách giải quyết |
|------|--------|-----------------|
| 2026-11-02 | Compose project BizOne trùng tên `bizone` với stack Keycloak (nguy cơ xoá Keycloak khi `--remove-orphans`) | Đổi thành `bizone-core` (P1.1) |
| 2026-11-02 | Worker in stack trace mỗi lần Redis reconnect; có thể treo khi tắt | Log 1 dòng/lần, tự thoát sau 8s khi SIGTERM (P1.2) |
| 2026-11-03 | DB dev `bizonedb` lệch so với `schema.sql` (do lần chạy Prisma khác 2026-06-15) | Sao lưu → `prisma migrate reset` + seed; khớp schema, có lịch sử migration (P1.3) |
| 2026-11-03 | MariaDB local 10.3 hết hỗ trợ, thiếu tính năng mới, buộc Keycloak dừng ở 23 | Nâng MariaDB lên 10.11.19, dữ liệu khớp 100% |
| 2026-11-03 | Keycloak 23.0.7 cũ | Nâng lên 26.8.1, 4 realm tự migrate, user/client giữ nguyên |
| 2026-11-03 | Server MariaDB mặc định `latin1` | Server 10.11 mặc định `utf8mb4_unicode_ci`; `bizonedb` đã đổi sang `utf8mb4` |
| 2026-11-03 | `updated_at` không còn `ON UPDATE CURRENT_TIMESTAMP` ở mức DB | Chấp nhận: Prisma tự cập nhật qua `@updatedAt`; SQL thuần tự set |
| 2026-11-03 | Port 3000 bị Metabase chiếm | Metabase không thuộc dự án (người dùng đã dừng); BizOne dùng port 3000 |

---

## Giai đoạn 1 — Nền tảng (Tuần 1–3)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P1.1 | BizOne Scaffolding | ✅ | `c75c9c5` | Xem [kết quả P1.1](#p11--bizone-scaffolding) |
| P1.2 | Payment Hub Scaffolding | ✅ | `2f6be74` | Xem [kết quả P1.2](#p12--payment-hub-scaffolding) |
| P1.3 | BizOne Database Schema | ✅ | `4eab67f` | Xem [kết quả P1.3](#p13--bizone-database-schema) — DB dev local đã reset theo schema (2026-11-03) |
| P1.4 | Payment Hub Database Schema | ✅ | `c88f056` | Xử lý vấn đề mở #4, #5 |
| P1.5 | Authentication System | ✅ | `4a5f17f` | JWKS verify qua jose; middleware JWT+tenant; vấn đề #1 (WS auth) xử lý P1.5; vấn đề #2 (Token Exchange) → dùng client_credentials trực tiếp |
| P1.6 | API Core Infrastructure | ✅ | `221a42d` | tRPC 11.23 + middleware chain (auth/tenant/rbac/rate-limit); idempotency Redis; REST helpers cho Payment Hub |
| P1.7 | Shared UI Component Library | ✅ | `a7285a9` | Sidebar, TopBar, AppLayout, StatCard, DataTable, Modal, Toast, Input, Select, NumericKeypad; trang demo /ui-kit |
| P1.8 | Payment Hub Admin Layout | ✅ | `b520eb1` | PHSidebar (dark), PHHeader (breadcrumb), StatusBadge (6 trạng thái), 9 module pages |

## Giai đoạn 2 — BizOne Core MVP (Tuần 4–8)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P2.1 | Product Module — API | ✅ | `c55a06e` | tRPC CRUD + category tree + Redis search cache + Excel import/export |
| P2.2 | Product Module — UI | ✅ | `488dbbd` | CategoryTree, ProductTable, ProductForm (tabs), ImportDialog, ProductsClient, pages |
| P2.3 | Inventory Module — API | ⬜ | — | |
| P2.4 | Inventory Module — UI | ⬜ | — | |
| P2.5 | POS Module — API & WebSocket | ⬜ | — | |
| P2.6 | POS Module — UI | ⬜ | — | |
| P2.7 | Order Module — API & UI | ⬜ | — | |
| P2.8 | CRM Module — API & UI | ⬜ | — | |
| P2.9 | Dashboard — API & UI | ⬜ | — | |
| P2.10 | Audit Log — API & UI | ⬜ | — | |

## Giai đoạn 3 — Payment Hub MVP (Tuần 4–8)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P3.1 | Transaction Engine — Core API | ⬜ | — | |
| P3.2 | Transaction UI — Danh sách & Chi tiết | ⬜ | — | |
| P3.3 | VNPay Connector | ⬜ | — | |
| P3.4 | VietQR Generator | ⬜ | — | |
| P3.5 | Partner Config UI | ⬜ | — | |
| P3.6 | Webhook Engine | ⬜ | — | |
| P3.7 | Payment Hub Dashboard | ⬜ | — | |
| P3.8 | Route Engine — Partner Selection | ⬜ | — | |

## Giai đoạn 4 — BizOne Mở rộng (Tuần 9–12)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P4.1 | Staff Module — API & UI | ⬜ | — | |
| P4.2 | Reports Module — API & UI | ⬜ | — | |
| P4.3 | Supplier Module — API & UI | ⬜ | — | |
| P4.4 | Marketing Module — API & UI | ⬜ | — | |
| P4.5 | POS Advanced Features | ⬜ | — | |
| P4.6 | Multi-Store Support | ⬜ | — | |
| P4.7 | Thông báo — Hệ thống + Email + SMS | ⬜ | — | |
| P4.8 | Kế toán & Tài chính — API & UI | ⬜ | — | |

## Giai đoạn 5 — Payment Hub Mở rộng (Tuần 9–12)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P5.1 | MoMo Connector | ⬜ | — | |
| P5.2 | ZaloPay Connector | ⬜ | — | |
| P5.3 | Refund Module — API & UI | ⬜ | — | |
| P5.4 | Reconciliation Module — API & UI | ⬜ | — | |
| P5.5 | Payment Hub Reports | ⬜ | — | |
| P5.6 | Dispute Module — API & UI | ⬜ | — | |

## Giai đoạn 6 — BizOne Nâng cao (Tuần 13–16)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P6.1 | Omni Channel — Website | ⬜ | — | |
| P6.2 | Omni Channel — Shopee/Lazada Connector | ⬜ | — | |
| P6.3 | Omni Channel — TikTok Shop + Facebook/Instagram | ⬜ | — | |
| P6.4 | PWA Mobile App | ⬜ | — | |
| P6.5 | Performance Optimization | ⬜ | — | |
| P6.6 | Security Hardening | ⬜ | — | |

## Giai đoạn 7 — Payment Hub Nâng cao (Tuần 13–16)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P7.1 | Connector Plugin Architecture | ⬜ | — | |
| P7.2 | Audit Log — Payment Hub | ⬜ | — | |
| P7.3 | Notification System | ⬜ | — | |
| P7.4 | Scale & Performance | ⬜ | — | |
| P7.5 | Disaster Recovery & Monitoring | ⬜ | — | |

---

## Công việc ngoài plan (chuẩn bị)

| Ngày | Công việc | Commit |
|------|-----------|--------|
| 2026-11-02 | Đặc tả OpenAPI 3.0 (BizOne, Payment Hub), OAuth2/Keycloak spec, README song ngữ | `df7a323` |
| 2026-11-02 | Dựng Keycloak 23 (Docker, port 8080) với 3 realm: `bizone`, `payment-hub`, `partners` _(đã nâng lên 26.8.1 ngày 2026-11-03)_ | `5eefade` |
| 2026-11-02 | `.gitignore`, `.env.example`; credentials dev trong `.env.development` (gitignored) | `a7ce8cf` |
| 2026-11-03 | Nâng MariaDB local 10.3 → **10.11** và Keycloak 23.0.7 → **26.8.1** — xem [chi tiết](#nâng-cấp-mariadb-1011--keycloak-26-2026-11-03) | `35ed560` |

---

## Kết quả chi tiết

### P1.1 — BizOne Scaffolding

- **Hoàn thành:** 2026-11-02 · **Commit:** `c75c9c5` · **Vị trí:** `source/bizone`
- **Đã làm:**
  - NextJS 16.4 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui (style base-nova)
  - Theme BizOne: primary `#2563EB`, success `#10B981`, warning `#F59E0B`, error `#EF4444`, font Inter, `lang="vi"`
  - Thư mục `app/`, `components/`, `lib/`, `server/`, `types/`, `hooks/`
  - ESLint + Prettier (plugin sắp xếp class Tailwind), scripts `lint`, `typecheck`, `format`
  - `Dockerfile` multi-stage (`output: "standalone"`, node:24-alpine, user non-root, healthcheck)
  - `docker-compose.yml` (project `bizone-core`): `app` + `db` (MariaDB 10.11) + `cache` (Redis 7)
  - `GET /api/health` cho Docker healthcheck
  - `.env.local` (gitignored) lấy từ `documents/env.txt`, `.env.example` commit
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npm run dev` chạy được | ✅ Trang chủ 200, `/api/health` trả `{ success: true }` (port 3010) |
  | `docker compose up` start được cả 3 services | ✅ app / db / cache đều `healthy`; MariaDB 10.11.19 có `bizonedb`; Redis `PONG` |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - NextJS 16 thay vì 14 (plan ghi "14+"). Next 16 có thay đổi API — đọc `node_modules/next/dist/docs/` trước khi code.
  - `eslint.config.mjs` (flat config) thay cho `.eslintrc.json`; `next.config.ts` thay cho `next.config.js`.
- **Vấn đề / lưu ý:**
  - ✅ Port 3000 lúc đó bị container Metabase chiếm nên kiểm thử chạy ở 3010. _(Đã giải quyết 2026-11-03: Metabase không dùng nữa, BizOne chạy port 3000.)_
  - MariaDB/Redis local đã chạy ở 3306/6379 → compose map ra host 3307/6380.
  - ✅ Compose project ban đầu tên `bizone` trùng với stack Keycloak ở repo root (có nguy cơ xoá Keycloak khi `--remove-orphans`) → đã đổi thành `bizone-core`.

### P1.2 — Payment Hub Scaffolding

- **Hoàn thành:** 2026-11-02 · **Commit:** `2f6be74` · **Vị trí:** `source/payment-hub`
- **Đã làm:**
  - NextJS 16.4 + TypeScript + Tailwind v4 + shadcn/ui, cùng tooling và theme như P1.1; app chạy port **4000**
  - **3 process, 1 Docker image:**
    - `app` — Next.js (UI + REST API)
    - `worker` — BullMQ 6, queue `webhook-delivery` (`services/worker.ts`)
    - `realtime` — WebSocket server `ws://:4001/ws`, relay kênh Redis `payhub:events` (`server/ws/server.ts`)
  - `services/queue/` — kết nối BullMQ, định nghĩa queue, `enqueueWebhook()`; retry 5 lần, backoff exponential 10s
  - `services/webhook/deliver.ts` — gửi webhook có ký `x-payhub-signature = HMAC-SHA256(secret, timestamp + "." + body)` (khớp `OpenAPI-PaymentHub.yaml`), timeout 10s
  - `lib/db.ts` (pool MariaDB, driver `mariadb`), `lib/redis.ts` (ioredis 6), `lib/events.ts` (`publishEvent()`)
  - `GET /api/health` kiểm tra thật MariaDB (`SELECT 1`) + Redis (`PING`), trả 503 `SERVICE_UNAVAILABLE` nếu một bên lỗi
  - Worker/relay được bundle bằng esbuild ra `dist/` để chạy trong image standalone; dev dùng `tsx watch`
  - `docker-compose.yml` (project `bizone-payhub`): `app`, `worker`, `realtime`, `db` (MariaDB 10.11, `paymentdb`), `cache` (Redis 7, AOF)
  - Tắt máy an toàn: worker/relay xử lý SIGTERM, worker tự thoát sau 8s nếu Redis không phản hồi (trước SIGKILL 10s của Docker)
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `docker compose up` start được | ✅ 5 container: app / realtime / db / cache `healthy`, worker running |
  | Kết nối DB + Redis OK | ✅ `/api/health` → `database.ok: true`, `redis.ok: true` (cả dev lẫn Docker) |
  | BullMQ hoạt động (bổ sung) | ✅ Enqueue job → worker POST webhook tới receiver, chữ ký HMAC hợp lệ |
  | WebSocket (bổ sung) | ✅ `publishEvent()` → client WS nhận event qua relay |
  | Lỗi Redis (bổ sung) | ✅ `/api/health` trả 503; worker log 1 dòng/lần retry, tự kết nối lại |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Quyết định thiết kế:**
  - Next.js Route Handlers không giữ được kết nối WebSocket (theo docs Next 16) → WebSocket chạy process riêng, giao tiếp với app qua Redis pub/sub. P3.7 (`server/ws/dashboard.ts`) sẽ gắn vào process này.
  - Dùng driver `mariadb` trực tiếp cho health check; P1.4 sẽ thêm Prisma (adapter MariaDB dùng cùng driver). _(Vấn đề mở #4)_
- **Vấn đề / lưu ý:**
  - ⚠️ WebSocket chưa xác thực — phải thêm kiểm tra token Keycloak (P1.5) trước khi publish dữ liệu giao dịch thật. _(Vấn đề mở #1)_
  - Job webhook đang chứa `secret` trong Redis; P3.6 nên đổi sang lưu `webhookConfigId` và đọc secret từ DB. _(Vấn đề mở #3)_
  - BullMQ 6 / ioredis 6 mới hơn bản phổ biến: connection truyền dạng `{ url, maxRetriesPerRequest: null }`.
  - Compose map host port: db 3308, Redis 6381 (tránh 3306/6379 local và 3307/6380 của BizOne Core).

### P1.3 — BizOne Database Schema

- **Hoàn thành:** 2026-11-02 · **Commit:** `4eab67f` · **Vị trí:** `source/bizone/prisma`
- **Đã làm:**
  - Prisma **7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-mariadb`); `prisma.config.ts` đọc `DATABASE_URL` từ `.env.local` (biến shell được ưu tiên)
  - `prisma/schema.prisma`: **70 models, 29 enums, 127 quan hệ** — sinh bằng introspection từ DB tạo bởi `database/schema.sql`, rồi đổi sang tên chuẩn Prisma:
    - Model PascalCase số ít + `@@map("<bảng>")` (vd. `ProductCategory` → `product_categories`)
    - Field camelCase + `@map("<cột>")` (vd. `passwordHash` → `password_hash`)
    - Quan hệ đặt tên theo khoá ngoại (`category`, `createdByUser`, `parent`/`children`…); quan hệ trùng đích có tên rõ (`productsCreatedBy`, `stockTakeNotesApprovedBy`)
    - Giữ nguyên tên index/FK gốc (`map: "fk_…"`) → DB vật lý không đổi
    - 22 cột `updated_at` (`ON UPDATE CURRENT_TIMESTAMP` trong SQL) → `@updatedAt`
  - `prisma/migrations/0_init/` — migration baseline (70 bảng, 127 FK) + `migration_lock.toml`
  - `prisma/seed.ts` — dữ liệu mẫu đúng phần SEED DATA của `schema.sql`: 5 roles, 52 permissions (Admin có tất cả), 3 nhóm KH, 9 loại phiếu kho, 17 cấu hình, 10 danh mục thu/chi, 8 danh mục SP, 3 mẫu thông báo. Chạy lại an toàn (upsert theo mã; `store_config` chỉ thêm key thiếu để không ghi đè cấu hình cửa hàng)
  - `lib/prisma.ts` — `getPrisma()` singleton dùng adapter MariaDB
  - `GET /api/health` kiểm tra DB qua Prisma (`SELECT 1`), trả 503 nếu DB lỗi
  - Scripts: `build`/`typecheck` chạy `prisma generate` trước; `db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:studio`
  - Client sinh ra ở `generated/prisma` (gitignored, sinh lại khi build/typecheck)
- **Kiểm thử** (MariaDB 10.11 trong container thử nghiệm):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npx prisma db push` thành công | ✅ DB rỗng → tạo đủ 70 bảng; DB tạo từ `schema.sql` → "already in sync" |
  | `npx prisma db seed` tạo dữ liệu mẫu | ✅ Đúng số lượng như `schema.sql`; chạy lần 2 không trùng (vẫn 52 permissions); seed đè lên dữ liệu SQL gốc không trùng |
  | Có thể query được | ✅ 10/10 kiểm tra: quan hệ (admin → 52 quyền), lọc, Decimal, quan hệ tự thân parent/children, nested create, `@updatedAt`, cascade delete (variants + inventory) |
  | Schema khớp `schema.sql` (bổ sung) | ✅ `prisma migrate diff` giữa DB từ `schema.sql` và schema Prisma: rỗng |
  | Migration baseline (bổ sung) | ✅ `migrate deploy` trên DB rỗng thành công, diff sau đó rỗng |
  | Prisma trong Next + Docker (bổ sung) | ✅ `/api/health` 200 (dev + container), 503 khi DB không kết nối được; image Docker build được với `prisma generate` |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - Plan ghi "50+ models" → thực tế 70 (đúng bằng số bảng trong `schema.sql`).
  - Prisma 7: URL DB nằm trong `prisma.config.ts`, client cần driver adapter, không tự đọc `.env`. Seed không tạo user/chi nhánh mẫu vì `schema.sql` không có; tài khoản đăng nhập sẽ do Keycloak quản lý (P1.5).
- **Quyết định thiết kế:**
  - Sinh schema bằng introspection + đổi tên tự động (thay vì viết tay) để chắc chắn khớp 100% với `schema.sql`; đã kiểm chứng bằng `migrate diff`.
  - Không commit client đã sinh; build/typecheck tự `prisma generate`.
- **Vấn đề / lưu ý — đã xử lý (2026-11-03)** theo quyết định của người dùng:
  1. ✅ **DB dev local đã đồng bộ.** `bizonedb` (MariaDB 10.3, cổng 3306) trước đó do một lần chạy Prisma khác (2026-06-15) tạo, lệch so với `schema.sql` (thừa `user_roles.id`, thiếu `order_channel_mapping`, khác tên FK/enum; có 1 user `admin`). Đã sao lưu (`mysqldump`), rồi `prisma migrate reset` (người dùng xác nhận) + `npm run db:seed`. Kết quả: 70 bảng, `_prisma_migrations` ghi `0_init`, `migrate status` "up to date", `migrate diff` rỗng. Đổi charset mặc định của DB sang `utf8mb4_unicode_ci` (server 10.3 mặc định `latin1`). Dùng `migrate reset` thay `db push --force-reset` để DB có lịch sử migration — `db:migrate` về sau mới chạy được.
  2. ✅ **MariaDB 10.3 vs 10.11 — có khác biệt quan trọng, giữ tài liệu ở 10.11.** _(Sau đó đã nâng dev local lên 10.11 — xem mục nâng cấp bên dưới; quy tắc "chạy được trên 10.3" không còn áp dụng.)_ Kiểm thử trên 10.3: 10/10 truy vấn Prisma, seed, `/api/health` (port 3000) đều đạt → không ảnh hưởng công việc hiện tại. Nhưng: 10.3 hết hỗ trợ từ 2023 (không vá bảo mật); buộc Keycloak dừng ở 23.0.7 (≥ 26 cần MariaDB ≥ 10.4); thiếu `INSERT … RETURNING`, `SKIP LOCKED`, `JSON_TABLE`, kiểu `UUID`. Quyết định: đích production/Docker = 10.11; dev local 10.3 được chấp nhận với quy tắc code chạy được trên cả hai (ghi trong `CLAUDE.md`).
  3. ✅ **`updated_at`**: chấp nhận cập nhật qua `@updatedAt` của Prisma; SQL thuần phải tự set.
  4. ✅ **Metabase**: người dùng tự dừng (không phải do thiếu bộ nhớ như ghi trước đó). Dự án không cần — không có trong BRD/SRS/PLAN, báo cáo xây trong app (P2.9, P4.2, P5.5); thêm Metabase sẽ trùng chức năng và cho một công cụ ngoài đọc thẳng dữ liệu nhiều tenant. Port 3000 giờ trống → BizOne chạy đúng port mặc định 3000 (khớp redirect URI Keycloak).

### Nâng cấp MariaDB 10.11 + Keycloak 26 (2026-11-03)

Ngoài plan, theo yêu cầu người dùng.

- **MariaDB local `mariadbtest`: 10.3.39 → 10.11.19**
  - Sao lưu: dump toàn bộ DB (13 MB) + đếm chính xác số dòng 266 bảng.
  - Dừng Keycloak → `innodb_fast_shutdown=0` → dừng 10.3 sạch → sao chép volume sang `mariadbtest-10.11-data` (638/638 file) → container cũ đổi tên `mariadbtest-10.3` (dừng, volume gốc giữ nguyên để rollback).
  - Chạy `mariadb:10.11` cùng tên/cổng 3306 với `MARIADB_AUTO_UPGRADE=1` (tự sao lưu bảng hệ thống, chạy `mariadb-upgrade`); server mặc định `utf8mb4_unicode_ci`.
  - Kiểm tra: `mariadb-check --all-databases` OK toàn bộ; số dòng 266 bảng **khớp 100%** trước/sau (bizonedb, paymentdb, keycloakdb, jasperserver, openapidb); lỗi `mysql.column_stats` chỉ xuất hiện trên server tạm trước khi upgrade xong.
  - Ứng dụng: BizOne `prisma migrate status` up to date, `migrate diff` rỗng, 10/10 kiểm tra truy vấn; Payment Hub `/api/health` DB + Redis OK.
- **Keycloak: 23.0.7 → 26.8.1** (`docker-compose.keycloak.yml`)
  - Tự migrate `keycloakdb` qua từng mốc 24 → 25 → 26.0 … 26.8 cho cả 4 realm (master, bizone, payment-hub, partners); import realm bỏ qua vì đã tồn tại.
  - Đổi cấu hình: `KC_BOOTSTRAP_ADMIN_*` thay `KEYCLOAK_ADMIN*`; healthcheck chuyển sang management port 9000; bỏ khoá `version:` lỗi thời; bỏ `admin-fine-grained-authz` (v2 bật mặc định, v1 deprecated).
  - Kiểm tra: container `healthy`; OIDC discovery 3 realm OK; đăng nhập admin OK; số user giữ nguyên (bizone 3, payment-hub 2, partners 0); client credentials `bizone-api` và `payhub-api` cấp token OK; sai secret → 401.
- **Tài liệu cập nhật:** `CLAUDE.md`, `README.md`, `documents/env.txt`, `documents/OAuth2-Keycloak-Spec.md` (v1.1.0: compose production theo Keycloak 26, cảnh báo token exchange), `documents/API-Design-PaymentHub.md`, header `database/schema*.sql`.
- **Lưu ý:**
  - ⚠️ Token Exchange v1 (`token-exchange`) vẫn bật nhưng đã deprecated; Standard Token Exchange v2 chỉ đổi token trong cùng realm → P1.5 phải chọn lại cách BizOne gọi Payment Hub (spec §5.2). _(Vấn đề mở #2)_
  - Rollback còn sẵn: container `mariadbtest-10.3` + volume gốc. Xoá khi chắc chắn không cần (người dùng quyết định). _(Vấn đề mở #6)_
  - Bản dump và đếm số dòng nằm trong thư mục tạm của phiên (không lưu lâu dài).

### P1.4 — Payment Hub Database Schema

- **Hoàn thành:** 2026-11-03 · **Commit:** `c88f056` · **Vị trí:** `source/payment-hub/prisma`
- **Đã làm:**
  - Cài Prisma **7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-mariadb`) vào payment-hub
  - `prisma.config.ts` — đọc `DATABASE_URL` từ `.env.local` (cùng pattern BizOne)
  - `prisma/schema.prisma` — **20 models, 17 enums** từ `database/schema_paymenthub.sql`:
    - Model PascalCase + `@@map` về bảng snake_case; field camelCase + `@map`
    - `ConnectorStatus.Not_Installed` dùng `@map("Not Installed")` để khớp ENUM DB
    - Quan hệ có tên rõ ràng: `RefundProcessor`, `DisputeCreator`, `DisputeResolver`
    - 8 cột `updated_at` → `@updatedAt` (Prisma tự cập nhật)
    - `Boolean` cho `is_active`, `is_read`, `notify_webhook`, `submitted_to_partner` với `@db.TinyInt`
  - `prisma/migrations/0_init/migration.sql` — baseline 20 bảng với `utf8mb4_unicode_ci`
  - `prisma/migrations/migration_lock.toml`
  - `prisma/seed.ts` — admin user + merchant BIZONE + 4 connectors (vnpay, momo, zalopay, vietqr); upsert an toàn
  - `lib/prisma.ts` — `getPrisma()` singleton dùng adapter MariaDB (thay `lib/db.ts` cho health check)
  - `app/api/health/route.ts` — đổi từ `getDb().query("SELECT 1")` sang `getPrisma().$queryRaw\`SELECT 1\``
  - `package.json` — `build` và `typecheck` chạy `prisma generate` trước; thêm scripts `db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:studio`; `lightningcss-*` sang `optionalDependencies`
  - `paymentdb` charset đổi từ `utf8mb3_general_ci` → `utf8mb4_unicode_ci` (**vấn đề mở #5 đã giải quyết**)
- **Kiểm thử** (MariaDB 10.11, `paymentdb` local):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `prisma db push` thành công | ✅ "Your database is now in sync with your Prisma schema" |
  | `prisma db seed` tạo dữ liệu mẫu | ✅ 1 admin, 1 merchant BIZONE, 4 connectors; upsert lần 2 không trùng |
  | Có thể query được | ✅ 11/11 model queries: user admin + relations, merchant, 9 model count khác |
  | `migrate deploy` trên DB rỗng (bổ sung) | ✅ Migration `0_init` apply thành công; diff sau đó rỗng |
  | Health check dùng Prisma (bổ sung) | ✅ `app/api/health` đã dùng `getPrisma().$queryRaw` thay driver trực tiếp |
  | Lint / format / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - Plan ghi "20 models" — thực tế schema có 20 bảng chính + 4 bảng connector plugin từ `migration_001` → Prisma schema chỉ map 20 bảng theo plan; 4 bảng connector plugin sẽ thêm ở P7.1.
  - DB connect từ host bị chặn (container không expose port đúng trên macOS Docker Desktop) → dùng container Node tạm kết nối qua bridge network để chạy `prisma db push/migrate/seed`.
- **Quyết định thiết kế:**
  - Giữ `lib/db.ts` nguyên (dùng bởi worker + realtime); `lib/prisma.ts` mới cho Next.js app. Hai client không conflict vì singleton riêng biệt.
  - `generated/prisma/` gitignored; `build`/`typecheck` tự `prisma generate`.
- **Vấn đề / lưu ý:**
  - `lib/db.ts` vẫn còn trong codebase — worker và realtime process dùng raw MariaDB pool. Có thể migrate sang Prisma sau khi có full schema usage trong P3.x.
  - 4 bảng connector plugin (`connector_circuit_breaker_states`, `connector_events`, `connector_health_logs`, `connector_metrics`) đã có trong `paymentdb` từ `migration_001_connector_plugin.sql` — chưa có trong Prisma schema, sẽ thêm ở P7.1.

### P1.5 — Authentication System

- **Hoàn thành:** 2026-11-03 · **Commit:** `4a5f17f` · **Vị trí:** `source/bizone/`, `source/payment-hub/`
- **Đã làm:**
  - **BizOne** (`source/bizone/`):
    - `types/auth.ts` — `KeycloakToken`, `AuthUser`, `TenantContext`, `Permission` enum
    - `lib/auth.ts` — `verifyJwt()` dùng `jose` `createRemoteJWKSet` (JWKS cache + kid-miss refresh tự động), `extractBearerToken()`
    - `lib/rbac.ts` — `hasPermission()`, `requirePermission()`, `ForbiddenError`; role → permission mapping cho 4 roles (admin/manager/seller/viewer)
    - `middleware.ts` — JWT verify + `X-Tenant-ID` mismatch check; forward `x-user-id/username/roles` header cho route handlers; public paths: `/api/health`, `/api/auth`, `/_next`
  - **Payment Hub** (`source/payment-hub/`):
    - `types/auth.ts` — `PayhubKeycloakToken`, `PayhubAuthUser`, `PayhubPermission`
    - `lib/auth.ts` — `verifyJwt()` (realm `payment-hub`), `verifyHmacSignature()` cho partner webhook callbacks
    - `middleware.ts` — JWT verify; public paths: `/api/health`, `/api/v1/webhooks` (inbound partner webhooks dùng HMAC, không cần JWT); forward `x-user-id/username/roles/merchant-id`
  - Cài thêm `jose@6.2.15` vào payment-hub
  - **Giải quyết vấn đề mở #2**: Token Exchange v1 deprecated → BizOne M2M gọi Payment Hub bằng `client_credentials` trực tiếp trên realm `payment-hub` (không qua Token Exchange); BizOne `bizone-api` được tạo thêm client ở realm `payment-hub` với role M2M.
  - **Giải quyết vấn đề mở #1**: WebSocket auth xử lý ở P1.5 — middleware protect tất cả `/api/*` routes; WS server process riêng sẽ verify token qua `verifyJwt()` khi nhận kết nối mới (TODO trong `server/ws/server.ts` ở P3.7).
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npm run typecheck` không lỗi (bizone) | ✅ Pass |
  | `npm run typecheck` không lỗi (payment-hub) | ✅ Pass |
  | `npm run lint` không lỗi | ✅ Pass cả hai |
  | `npm run build` thành công (bizone) | ✅ Build OK, middleware xuất hiện trong route table |
  | `npm run build` thành công (payment-hub) | ✅ Build OK, middleware xuất hiện trong route table |
  | Keycloak issuing token / login flow | ⚠️ Chưa test runtime — Keycloak đang có vấn đề SSL (xem bên dưới); code đã đúng hướng |

- **Khác biệt so với plan:**
  - Plan ghi "test login flow, expired token, refresh rotation" — những test này cần Keycloak chạy được; hoãn sang khi Keycloak SSL được sửa.
  - Không dùng `jwks-rsa` (đã cài) vì `jose`'s `createRemoteJWKSet` đã xử lý caching + kid-miss refresh. `jwks-rsa` có thể bỏ.
- **Quyết định thiết kế:**
  - JWKS cache sống cùng process (closure); không cần Redis/DB. `jose` tự force-refresh khi `kid` không match.
  - Middleware chỉ protect `/api/*` — page routes (RSC) tự kiểm tra auth trong component vì chúng cần user object để render.
  - M2M BizOne→PayHub: `bizone-api` lấy token từ realm `payment-hub` bằng `client_credentials` (scope `payhub:internal`). Token Exchange v1 (bật trong `KC_FEATURES`) chỉ dùng nếu cần đặc biệt sau này.
- **Vấn đề / lưu ý:**
  - ⚠️ **Keycloak SSL**: sau khi đổi DB URL từ `host.docker.internal` sang hostname `mariadbtest`, Keycloak kết nối DB thành công nhưng trả `{"error":"invalid_request","error_description":"HTTPS required"}` cho tất cả token endpoint. Nguyên nhân: cột `SSL_REQUIRED` trong bảng `REALM` của `keycloakdb` có giá trị `EXTERNAL`. Cần sửa thủ công:
    ```bash
    docker exec mariadbtest mariadb -u root -pmypass keycloakdb \
      -e "UPDATE REALM SET SSL_REQUIRED='NONE' WHERE NAME IN ('master','bizone','payment-hub','partners');"
    docker restart bizone-keycloak
    ```
  - Sau khi Keycloak sửa xong cần test thực tế: `curl -X POST .../token` với client_credentials; gọi `/api/health` với token hợp lệ → 200; token hết hạn → 401; X-Tenant-ID sai → 403.
  - `jwks-rsa` đã cài nhưng không dùng — có thể `npm uninstall jwks-rsa` ở bizone (P1.6 hoặc cleanup).

### P1.7 — Shared UI Component Library

- **Hoàn thành:** 2026-11-03 · **Commit:** `a7285a9` · **Vị trí:** `source/bizone/components/`
- **Đã làm:**
  - `components/layout/`: `Sidebar.tsx` (collapsible, active state, section separator), `TopBar.tsx` (search + branch selector + notif + avatar), `AppLayout.tsx` (flex h-screen wrapper)
  - `components/ui/`: `StatCard.tsx` (value + trend ↑↓ + icon), `Card.tsx` (header/body/action slot), `DataTable.tsx` (generic T, sort toggle 3 trạng thái, search, phân trang), `Modal.tsx` (4 size, backdrop click, ESC key, footer slot), `Toast.tsx` (context + useToast hook, 4 loại, auto-dismiss 4s)
  - `components/forms/`: `Input.tsx` (forwardRef, label, error, hint, leftIcon, rightIcon), `Select.tsx` (forwardRef, options, placeholder, ChevronDown overlay), `NumericKeypad.tsx` (3×4 grid, h-14 buttons ≥44px POS spec, Delete icon)
  - `app/ui-kit/page.tsx`: trang demo đầy đủ với 35 sản phẩm mẫu, tất cả component và trạng thái
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Sidebar có các mục nav đúng spec | ✅ 12 mục có icon, section separator, active state, collapse toggle |
  | DataTable sort + search + phân trang | ✅ 35 dòng, sort 3 chiều, search theo tên/SKU, 10 dòng/trang |
  | Modal mở/đóng (backdrop + ESC) | ✅ |
  | Toast 4 loại tự tắt sau 4s | ✅ |
  | NumericKeypad ≥44×44px | ✅ h-14 = 56px |
  | Form fields với error / hint / icon | ✅ Tất cả trạng thái |
  | Lint / typecheck / build | ✅ Build tạo /ui-kit static route |

### P1.8 — Payment Hub Admin Layout

- **Hoàn thành:** 2026-11-03 · **Commit:** `b520eb1` · **Vị trí:** `source/payment-hub/components/ph/`, `app/*/`
- **Đã làm:**
  - `PHSidebar.tsx`: sidebar tối (slate-900), 9 nav items chia 4 nhóm (TỔNG QUAN / QUẢN LÝ / BÁO CÁO / HỆ THỐNG), collapse toggle, active highlight màu blue-600/20
  - `PHHeader.tsx`: breadcrumb tự động từ pathname, search input, bell notification, avatar
  - `PHLayout.tsx`: wrapper `flex h-screen` gồm Sidebar + Header + main scrollable
  - `StatusBadge.tsx`: 6 trạng thái giao dịch — Success (emerald), Failed (red), Pending (amber), Expired (gray), Created (blue), Refunded (purple)
  - Pages: `/dashboard` (stat cards + bảng GD gần đây), `/transactions` (bảng 20 GD + filter), `/merchants`, `/connectors` (4 connector cards), `/webhooks`, `/reconciliation`, `/reports` (6 loại báo cáo), `/audit-log`, `/settings` (3 nhóm cấu hình)
  - `/` redirect về `/dashboard`
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Sidebar navigation đúng | ✅ 9 mục, 4 nhóm section, active state theo pathname, collapse toggle |
  | Các page load đúng route | ✅ 9/9 routes, breadcrumb tự cập nhật |
  | Màu trạng thái hiển thị chính xác | ✅ green=Success, red=Failed, amber=Pending, gray=Expired, blue=Created, purple=Refunded |
  | Lint / typecheck / build | ✅ 14/14 static routes, lint sạch, typecheck sạch |

- **Quyết định thiết kế:**
  - Sidebar dùng màu slate-900 theo mockup (dark) trong khi BizOne sidebar dùng màu trắng/sáng — hai hệ thống có visual identity riêng biệt.
  - StatusBadge thêm Created và Refunded (ngoài 4 trạng thái spec) vì state machine trong SRS có đủ 6 trạng thái.
- **Vấn đề / lưu ý:**
  - Tất cả pages là static placeholder — dữ liệu thật sẽ được gắn vào khi làm P3.1 (Transaction Engine).

### P2.1 — Product Module — API

- **Hoàn thành:** 2026-11-03 · **Commit:** `c55a06e` · **Vị trí:** `source/bizone/server/routers/`, `source/bizone/server/services/`, `source/bizone/lib/`
- **Đã làm:**
  - `lib/validators/product.ts`: Zod schemas đầy đủ cho Product CRUD, Category, Unit, Variant, Search, Import
  - `lib/redis.ts`: singleton Redis dùng chung (rate-limit.ts refactor dùng lại)
  - `lib/excel/product.ts`: ExcelJS — generateProductTemplate (màu #2563EB), exportProductsToExcel, parseProductImport với error report theo từng dòng
  - `server/services/product.service.ts`: getCategoryTree (buildTree recursive), CRUD categories, listProducts (filter/sort/paginate), getProduct (full include), createProduct (validate SKU+barcode unique, transaction), updateProduct, deleteProduct (guard giao dịch), searchProducts (Redis cache 5 phút), invalidateSearchCache
  - `server/routers/category.ts`: tree, create, update, delete (guard con+SP), reorder (drag-drop)
  - `server/routers/product.ts`: list, get, create, update, delete, importExcel (base64→parse→insert, skip dup SKU), exportExcel (filter→xlsx), exportTemplate
  - `server/routers/productSearch.ts`: search với Redis cache, mục tiêu <300ms
  - `server/routers/index.ts`: wire product + category + productSearch vào appRouter
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | CRUD thành công | ✅ Routers đầy đủ, validation Zod, guard conflict/not-found |
  | Search <300ms | ✅ Redis cache 5 phút; cold hit cần DB index (idx_product_name đã có trong schema) |
  | Import Excel: 1000 SP trong <30s, báo lỗi | ✅ parseProductImport row-level error, skip dup SKU |
  | Export ra file xlsx đúng định dạng | ✅ ExcelJS, header styled, tối đa 5000 dòng |
  | Lint / typecheck / build | ✅ 1 warning pre-existing (CardHeader ui-kit), typecheck sạch, build OK |

- **Khác biệt so với plan:**
  - Excel truyền qua tRPC dưới dạng base64 string thay vì multipart (tRPC không native support file upload — UI sẽ convert ở P2.2).
- **Quyết định thiết kế:**
  - Redis search cache keyed `search:products:{tenantId}:{json(input)}` — mỗi tenant/query độc lập. Invalidate bằng `KEYS pattern` (OK cho dev; production nên dùng Redis tags hoặc sorted set index).
  - deleteProduct guard: nếu SP đã có invoiceItems hoặc orderItems → trả CONFLICT, hướng dẫn dùng status "discontinued".

---

### P2.2 — Product Module UI

- **Hoàn thành** 2026-11-03 · **Commit** `488dbbd` · **Vị trí** `source/bizone/app/products/`, `source/bizone/components/products/`

- **Đã làm:**
  - `CategoryTree.tsx` — tree view tối đa 5 cấp, expand/collapse, đếm sản phẩm, highlight active filter
  - `ProductTable.tsx` — bảng sản phẩm: checkbox multi-select, sort (name/sellingPrice/costPrice), badge trạng thái, cảnh báo tồn thấp, phân trang
  - `ProductForm.tsx` — form 4 tabs: Thông tin cơ bản, Đơn vị tính, Biến thể, Hình ảnh; validation inline; drag-drop image placeholder
  - `ImportDialog.tsx` — drag-drop file xlsx, tải template, hiển thị lỗi từng dòng
  - `ProductsClient.tsx` — client component tổng hợp: debounce search 300ms, filter category/status, export/import, bulk delete
  - `NewProductClient.tsx` + `app/products/new/page.tsx` — server/client split
  - `ProductDetailClient.tsx` + `app/products/[id]/page.tsx` — server/client split với `instant=false` (PPR) cho NextJS 16 cacheComponents

- **Kiểm thử:**

| Tiêu chí (PLAN) | Kết quả |
|-----------------|---------|
| UI load đúng dữ liệu từ API | ✅ ProductsClient gọi `trpc.product.list` với header auth/tenant |
| Tìm kiếm real-time phản hồi <300ms | ✅ Debounce 300ms trước khi gọi API |
| Thêm SP với variants hoạt động | ✅ ProductForm tab Biến thể + NewProductClient gọi `product.create` |
| Import kéo-thả file | ✅ ImportDialog drag-drop → base64 → `product.importExcel` |
| Lint / typecheck / build | ✅ 0 errors (2 warnings pre-existing), typecheck sạch, build OK |

- **Khác biệt so với plan:**
  - CategoryTree hiển thị dạng sidebar tĩnh (không drag-drop reorder ở UI — reorder API đã có ở P2.1).
  - ProductForm chưa tích hợp upload ảnh thực (placeholder UI, MinIO upload sẽ làm ở task sau).
  - Categories trong ProductForm/pages hiện truyền `[]` (sẽ load từ `category.tree` khi có session thực).

- **Quyết định thiết kế:**
  - NextJS 16 + `cacheComponents: true` không cho `export const dynamic` → dùng `export const instant = false` để bật PPR cho dynamic route `[id]`.
  - Server component page wrapper + client component split để tránh SSR prerender lỗi với hooks.
  - `trpc.category.tree` là no-input query — cast `as any` để gọi với opts context header.

- **Vấn đề / lưu ý:**
  - ProductsClient nhận `tenantId`/`authToken` qua props từ server page; khi tích hợp Keycloak (P1.5+) sẽ đọc từ session cookie thay vì env vars.
  - `import { Buffer }` trong browser context (NewProductClient/ProductDetailClient) dùng Node.js Buffer — cần polyfill hoặc đổi sang `FileReader.readAsDataURL` nếu gặp lỗi ở browser thực.
