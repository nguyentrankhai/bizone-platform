# Tiến độ thực hiện — BizOne & Payment Hub

> Theo dõi tiến độ các task trong [PLAN.md](PLAN.md) và ghi chú kết quả của từng task.
> Cập nhật mỗi khi một task bắt đầu, hoàn thành hoặc bị chặn.

**Trạng thái:** ✅ Hoàn thành · 🟡 Đang làm · ⬜ Chưa bắt đầu · ⛔ Bị chặn

**Cập nhật lần cuối:** 2026-11-03

---

## Tổng quan

| Giai đoạn | Tổng task | ✅ | 🟡 | ⬜ |
|-----------|-----------|----|----|----|
| 1 — Nền tảng | 8 | 3 | 0 | 5 |
| 2 — BizOne Core MVP | 10 | 0 | 0 | 10 |
| 3 — Payment Hub MVP | 8 | 0 | 0 | 8 |
| 4 — BizOne Mở rộng | 8 | 0 | 0 | 8 |
| 5 — Payment Hub Mở rộng | 6 | 0 | 0 | 6 |
| 6 — BizOne Nâng cao | 6 | 0 | 0 | 6 |
| 7 — Payment Hub Nâng cao | 5 | 0 | 0 | 5 |
| **Tổng** | **51** | **3** | **0** | **48** |

---

## Giai đoạn 1 — Nền tảng (Tuần 1–3)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P1.1 | BizOne Scaffolding | ✅ | `c75c9c5` | Xem [kết quả P1.1](#p11--bizone-scaffolding) |
| P1.2 | Payment Hub Scaffolding | ✅ | `2f6be74` | Xem [kết quả P1.2](#p12--payment-hub-scaffolding) |
| P1.3 | BizOne Database Schema | ✅ | `4eab67f` | Xem [kết quả P1.3](#p13--bizone-database-schema) — DB dev local đã reset theo schema (2026-11-03) |
| P1.4 | Payment Hub Database Schema | ⬜ | — | |
| P1.5 | Authentication System | ⬜ | — | Dùng Keycloak thay NextAuth/Lucia (đã dựng sẵn) |
| P1.6 | API Core Infrastructure | ⬜ | — | |
| P1.7 | Shared UI Component Library | ⬜ | — | |
| P1.8 | Payment Hub Admin Layout | ⬜ | — | |

## Giai đoạn 2 — BizOne Core MVP (Tuần 4–8)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P2.1 | Product Module — API | ⬜ | — | |
| P2.2 | Product Module — UI | ⬜ | — | |
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
| 2026-11-02 | Dựng Keycloak 23 (Docker, port 8080) với 3 realm: `bizone`, `payment-hub`, `partners` | `5eefade` |
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
  - Port 3000 lúc đó bị container Metabase chiếm nên kiểm thử chạy ở 3010. _(Đã hết: Metabase không dùng nữa, BizOne chạy port 3000 — xem P1.3.)_
  - MariaDB/Redis local đã chạy ở 3306/6379 → compose map ra host 3307/6380.
  - Compose project ban đầu tên `bizone` trùng với stack Keycloak ở repo root (có nguy cơ xoá Keycloak khi `--remove-orphans`) → đổi thành `bizone-core`.

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
  - Dùng driver `mariadb` trực tiếp cho health check; P1.4 sẽ thêm Prisma (adapter MariaDB dùng cùng driver).
- **Vấn đề / lưu ý:**
  - ⚠️ WebSocket chưa xác thực — phải thêm kiểm tra token Keycloak (P1.5) trước khi publish dữ liệu giao dịch thật.
  - Job webhook đang chứa `secret` trong Redis; P3.6 nên đổi sang lưu `webhookConfigId` và đọc secret từ DB.
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
  - ⚠️ Token Exchange v1 (`token-exchange`) vẫn bật nhưng đã deprecated; Standard Token Exchange v2 chỉ đổi token trong cùng realm → P1.5 phải chọn lại cách BizOne gọi Payment Hub (spec §5.2).
  - Rollback còn sẵn: container `mariadbtest-10.3` + volume gốc. Xoá khi chắc chắn không cần (người dùng quyết định).
  - Bản dump và đếm số dòng nằm trong thư mục tạm của phiên (không lưu lâu dài).
