# CLAUDE.md — BizOne Project

## Tổng quan dự án

**BizOne** là nền tảng quản lý bán hàng All-In-One (Omni Channel POS) dành cho SME Việt Nam.
**Payment Hub** là hệ thống trung gian thanh toán tập trung phục vụ hệ sinh thái BizOne.

Hai hệ thống độc lập, triển khai song song, giao tiếp qua REST API + Webhook.

---

## Quy trình xây dựng & phát triển (BẮT BUỘC mỗi phiên)

Mỗi phiên làm việc thực hiện **một task** trong `PLAN.md` theo đúng 6 bước sau, rồi dừng lại hỏi người dùng.

### B1. Đọc `PROGRESS.md` — xác định việc cần làm

- Xem bảng tổng quan và các bảng theo giai đoạn để biết task nào đã ✅, đang 🟡, bị ⛔.
- Nếu có task 🟡 (dở dang từ phiên trước) → tiếp tục task đó trước.
- Nếu không: chọn task ⬜ **có ID nhỏ nhất** mà các task phụ thuộc đã xong (xem mục *PHỤ THUỘC & ĐIỀU KIỆN TIÊN QUYẾT* cuối `PLAN.md`; Giai đoạn 1 phải xong trước GĐ 2+3, GĐ 2+3 trước GĐ 4+5, …).
- Đọc phần **Vấn đề / lưu ý** và **Quyết định thiết kế** của các task đã xong — đó là ràng buộc cho task mới (ví dụ: dùng Keycloak thay NextAuth/Lucia; WebSocket chạy process riêng).
- Báo cho người dùng biết task sẽ làm trong phiên này trước khi bắt đầu.

### B2. Đọc `PLAN.md` — xác định phạm vi task

- Đọc đúng dòng của task: **Công việc cần thực hiện**, **Prompt cho AI Agent**, **Kiểm thử / Kết quả**. Cột *Kiểm thử / Kết quả* là tiêu chí nghiệm thu.
- Đọc tài liệu liên quan: `documents/SRS-*.md`, `documents/API-Design-*.md`, `documents/OpenAPI-*.yaml`, `database/schema*.sql`, `mockups-*/` (với task UI).
- Nếu `PLAN.md` mâu thuẫn với quyết định đã ghi trong `PROGRESS.md`/`CLAUDE.md` → theo quyết định đã ghi, và nêu rõ khác biệt trong kết quả.
- Code NextJS 16: đọc `source/<app>/node_modules/next/dist/docs/` cho API liên quan trước khi viết.

### B3. Xây dựng & kiểm thử

- Đánh dấu task 🟡 trong `PROGRESS.md` khi bắt đầu.
- Chỉ làm trong phạm vi task; không làm trước việc của task sau.
- Kiểm thử bắt buộc trước khi coi là xong:
  - `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` trong app bị ảnh hưởng.
  - Chạy thật từng tiêu chí ở cột *Kiểm thử / Kết quả* (dev server, Docker, API, UI qua trình duyệt) — không chỉ dựa vào type check.
  - Thử thêm trường hợp lỗi chính (input sai, dịch vụ phụ thuộc down…).
- Dọn dẹp sau kiểm thử: dừng dev server, `docker compose down -v` các stack test, xoá dữ liệu test đã tạo. **Không** đụng container Keycloak/MariaDB/Redis/MinIO đang chạy sẵn và không dùng `--remove-orphans`.
- Nếu một tiêu chí không đạt được: đánh dấu ⛔ hoặc giữ 🟡, ghi rõ lý do, không báo là xong.

### B4. Ghi kết quả vào `PROGRESS.md`

- Cập nhật dòng của task (trạng thái, commit, ghi chú), bảng **Tổng quan** (số ✅/🟡/⬜) và **Cập nhật lần cuối**.
- Thêm mục `### Px.y — <tên task>` trong **Kết quả chi tiết**, theo đúng mẫu của P1.1/P1.2:
  - **Hoàn thành** (ngày) · **Commit** · **Vị trí**
  - **Đã làm**
  - **Kiểm thử**: bảng *Tiêu chí (PLAN) | Kết quả* — mỗi tiêu chí trong PLAN một dòng, ghi kết quả thực tế
  - **Khác biệt so với plan**, **Quyết định thiết kế**, **Vấn đề / lưu ý** (việc để lại cho task sau)
- Cập nhật mục *Cấu trúc dự án* / *Chạy …* trong `CLAUDE.md` và `README.md` nếu cấu trúc, lệnh hoặc port thay đổi.

### B5. Commit & push GitHub

- Kiểm tra trước khi commit: `git status`, chỉ stage file của task; **không** commit `.env.local`, `.env.development`, `dist/`, `.next/`, `node_modules/`; `.env.example` chỉ chứa placeholder.
- Commit message theo Conventional Commits, nêu ID task: `feat: <mô tả> (P1.3)`, `docs: …`, `chore: …`; thân commit giải thích *tại sao*.
- Mã commit chỉ có sau khi commit → tạo thêm commit nhỏ `docs: record Px.y commit hash in PROGRESS.md` để điền mã vào `PROGRESS.md`.
- `git push origin main` (remote: `git@github.com:nguyentrankhai/bizone-platform.git`). Nếu push bị chặn, báo người dùng chạy lệnh thủ công.

### B6. Kiểm tra quota & hỏi người dùng

- Kiểm tra quota bằng tool `get_usage` (Claude desktop app): báo **% đã dùng** và **thời điểm reset** của giới hạn 5 giờ và giới hạn tuần, cùng % context của phiên hiện tại.
- Tóm tắt: task vừa xong, kết quả kiểm thử, commit đã push, task tiếp theo dự kiến (theo B1).
- **Dừng lại và hỏi** người dùng có tiếp tục task tiếp theo không. Không tự động bắt đầu task mới.
- Gợi ý: nếu giới hạn 5 giờ đã dùng > 80% hoặc context > 70%, đề xuất dừng hoặc mở phiên mới thay vì làm tiếp.

---

## Kiến trúc tổng thể

```
CLIENT LAYER
  BizOne Web App (NextJS + tRPC)
  BizOne POS     (NextJS + WebSocket)
  Payment Hub Admin (NextJS + REST)

API GATEWAY LAYER
  NextJS API Routes / tRPC / REST
  Auth (Keycloak OIDC) / RBAC / Rate Limit

SERVICE LAYER
  BizOne: POS · Product · Order · CRM · Report · Warehouse · Staff · Marketing · Accounting
  PayHub: Txn Engine · Webhook · Recon · Connector · Refund

DATA LAYER
  MariaDB (bizonedb)   — multi-tenant BizOne
  MariaDB (paymentdb)  — Payment Hub
  Redis                — cache + session + QR TTL
  MinIO/S3             — file storage (bucket: bizone)
  BullMQ               — async job queue
```

---

## Cấu trúc dự án

```
bizone/                              # repo root (git: nguyentrankhai/bizone-platform)
├── CLAUDE.md                        # context cho AI assistant (file này)
├── README.md                        # giới thiệu dự án (EN + VI)
├── PLAN.md                          # roadmap 6 giai đoạn, task P1.1 → P7.x
├── PROGRESS.md                      # tiến độ từng task + kết quả kiểm thử (cập nhật sau mỗi task)
├── .env.development                 # credentials dev toàn hệ thống (gitignored)
├── .env.example                     # template env toàn hệ thống (commit)
├── docker-compose.keycloak.yml      # Keycloak 26.8.1 (port 8080, DB keycloakdb trên MariaDB 10.11), compose project "bizone"
├── keycloak/realms/                 # realm import: bizone / payment-hub / partners
├── database/                        # SQL schema gốc (schema.sql, schema_paymenthub.sql, migrations)
├── documents/                       # BRD, SRS, URD, API design, OpenAPI YAML, OAuth2/Keycloak spec, env.txt
├── mockups-bizone/                  # 8 màn hình HTML BizOne
├── mockups-paymenthub/              # mockup HTML Payment Hub Admin
├── graphify-out/                    # knowledge graph (graph.html, graph.json, GRAPH_REPORT.md)
├── .github/workflows/ci.yml          # CI: format, lint, typecheck, test, build, build:jobs cho 2 app
├── .agents/skills/                  # skills: software-architecture-design, frontend-design
└── source/                          # MÃ NGUỒN ỨNG DỤNG
    ├── bizone/                      # P1.1 — BizOne Core (NextJS 16)
    │   ├── app/                     # App Router: pages, layouts, route handlers
    │   │   ├── api/health/route.ts  # GET /api/health (Docker healthcheck)
    │   │   ├── api/inventory/alerts/route.ts  # P2.4 — SSE cảnh báo tồn thấp (relay Redis "bizone:low-stock")
    │   │   ├── api/webhooks/payhub/route.ts  # P3.6 — nhận webhook Payment Hub (HMAC + chống trùng X-Webhook-Id)
    │   │   ├── products/            # P2.2 — UI sản phẩm
    │   │   ├── warehouse/           # P2.4 — kho: tồn, phiếu nhập/xuất (transactions/new), stock-take, transfer
    │   │   ├── pos/                 # P2.6 — /pos (bán hàng), /pos/session (mở/khóa ca), /pos/display?session= (màn hình khách)
    │   │   ├── layout.tsx           # root layout, font Inter, lang="vi"
    │   │   ├── page.tsx
    │   │   └── globals.css          # Tailwind v4 + shadcn theme (primary #2563EB, success/warning/info)
    │   ├── components/ui/           # shadcn/ui components (style base-nova)
    │   ├── components/inventory/    # P2.4 — WarehouseTable, StockTakeForm, TransferForm, BarcodeScanInput…
    │   ├── components/pos/          # P2.6 — PosClient, ProductGrid, CartPanel, PaymentModal, CustomerDisplay, Receipt, SessionClient
    │   ├── hooks/                   # useLowStockAlerts (SSE), usePosWebSocket (giỏ POS: WS + fallback cục bộ), useBarcodeScan
    │   ├── lib/                     # tiện ích dùng chung (utils.ts: cn(), prisma.ts: getPrisma(), tenant.ts: DB theo tenant, trpc.ts, dev-auth.ts)
    │   │   └── pos/                 # P2.5 — cart.ts (tính tiền dùng chung), protocol.ts (sự kiện WS), sync-client.ts (WS + BroadcastChannel), vietqr.ts (P2.6)
    │   ├── prisma/                  # P1.3 — schema.prisma (70 models), migrations/0_init, seed.ts
    │   ├── prisma.config.ts         # Prisma 7 config (DATABASE_URL từ .env.local)
    │   ├── generated/prisma/        # Prisma client sinh ra (gitignored)
    │   ├── server/                  # tRPC routers, services, middleware (P1.6)
    │   │   ├── routers/pos.ts       # P2.5 — ca, hóa đơn, thanh toán, đổi/trả, quote, scan
    │   │   ├── services/            # cashSession, invoice, payment, pricing, posCart, posEvents…
    │   │   ├── queue/inventory.ts   # P2.5 — BullMQ "bizone-inventory" (cảnh báo tồn sau bán/trả)
    │   │   ├── ws/pos.ts            # P2.5 — process WebSocket POS 2 màn hình :3002/ws/pos/{sessionId}
    │   │   └── worker.ts            # P2.5 — process worker BullMQ
    │   ├── types/                   # TypeScript types dùng chung
    │   ├── tests/                   # Vitest (`npm test`): cart, rbac, tenant
    │   ├── public/                  # static assets
    │   ├── Dockerfile               # multi-stage, output standalone, node:24-alpine
    │   ├── docker-compose.yml       # project "bizone-core": app + db (MariaDB 10.11) + cache (Redis 7)
    │   ├── .env.local               # env dev của app (gitignored)
    │   ├── .env.example             # template env của app
    │   ├── .prettierrc / eslint.config.mjs / tsconfig.json / components.json
    │   └── AGENTS.md                # do `next dev` tự sinh — đọc docs trong node_modules/next/dist/docs
    └── payment-hub/                 # P1.2 — Payment Hub (NextJS 16 + BullMQ + WebSocket)
        ├── app/                     # App Router; api/health/route.ts kiểm tra MariaDB + Redis
        ├── components/ui/           # shadcn/ui
        ├── app/api/ipn/vnpay/       # P3.3 — IPN VNPay (public, verify HMAC-SHA512)
        ├── app/pay/                 # P3.3 — /pay/{txnCode} (chọn PT → PSP), /pay/vnpay/return (redirect)
        ├── app/api/v1/qr/           # P3.4 — POST generate, GET {transaction_id} (QR hiện hành, tự refresh khi hết hạn)
        ├── app/qr/[file]/           # P3.4 — ảnh QR public /qr/{token}.png (từ Redis, hết hạn cùng QR)
        ├── app/partners/            # P3.5 — /partners (card), /partners/new, /partners/{id} (form, test, kích hoạt, lịch sử)
        ├── app/api/internal/partners/ # P3.5 — CRUD, /test, /status, /logs (JWT + role)
        ├── app/api/internal/webhooks/ + webhook-logs/ # P3.6 — CRUD, ping, status, rotate-secret, stats; lịch sử, chi tiết, replay
        ├── app/webhooks/            # P3.6 — UI thống kê, endpoint, lịch sử gửi + replay
        ├── lib/                     # db.ts, redis.ts, events.ts (publishEvent, canReceive), crypto.ts (AES-256-GCM), hmac.ts (chữ ký merchant), api-keys.ts
        ├── server/services/         # transaction.service, stateMachine, payment.service (P3.3: initiate + apply IPN), qr.service (P3.4), partner.service (P3.5), webhook.service (P3.6: outbox, CRUD, replay, stats)
        ├── services/
        │   ├── connectors/          # P3.3 — types.ts (PaymentConnector), registry.ts, vnpay/ (index.ts, vnpay.util.ts)
        │   ├── qr/vietqr.ts         # P3.4 — payload EMVCo/VietQR (NAPAS 247), CRC16, render PNG 200/300/500
        │   ├── queue/connection.ts  # kết nối BullMQ
        │   ├── webhook/             # P3.6 — sender.ts (ký HMAC, chặn SSRF), queue.ts (BullMQ, backoff), deliver.ts (processor worker)
        │   └── worker.ts            # process worker (BullMQ)
        ├── server/ws/server.ts      # process realtime: WebSocket :4001/ws (JWT + role, lọc theo merchant), relay Redis "payhub:events"
        ├── server/middleware/       # apiAuth.ts (API key + HMAC), adminAuth.ts (role admin/viewer), idempotency.ts
        ├── scripts/create-api-key.ts # `npm run apikey:create -- <MERCHANT_CODE>`
        ├── tests/                   # Vitest (`npm test`): stateMachine, hmac, security
        ├── hooks/  types/  public/
        ├── Dockerfile               # 1 image cho 3 process (app / dist/worker.js / dist/server.js)
        └── docker-compose.yml       # project "bizone-payhub": app, worker, realtime, db, cache
```

### Chạy BizOne app (`source/bizone`)

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Dev server port 3000 (DB dev: `bizonedb` trên MariaDB local 3306) |
| `npm run build` / `npm start` | Build & chạy production |
| `npm run lint` / `npm run typecheck` / `npm run format` / `npm test` | ESLint / tsc / Prettier / Vitest |
| `docker compose up -d --build` | app + MariaDB 10.11 (host 3307) + Redis (host 6380); `APP_PORT=3010` để đổi port app |
| `npm run db:push` / `db:migrate` / `db:seed` / `db:studio` | Prisma: đồng bộ schema / chạy migration / seed dữ liệu mẫu / Prisma Studio |
| `npm run dev:realtime` / `npm run dev:worker` | POS WebSocket (port `POS_WS_PORT`, mặc định 3002) / BullMQ worker (tsx watch, đọc `.env.local`) |
| `npm run build:jobs` | Bundle ESM `dist/pos.mjs` + `dist/worker.mjs` (chạy `node --env-file=.env.local dist/pos.mjs`) |

**Lưu ý POS realtime**: token gửi qua subprotocol `new WebSocket(url, ["bizone-pos", token])` + `?tenant=`; giỏ hàng lưu Redis `pos:cart:{sessionId}`, mọi thay đổi publish `bizone:pos:{sessionId}`. Mutation POS dùng `posPermissionProcedure` (300 req/phút). Bundle phải là ESM vì Prisma 7 client dùng `import.meta.url`. UI POS (P2.6) cần cả `npm run dev` và `npm run dev:realtime`; QR chuyển khoản lấy tài khoản từ `store_config` (`bank_bin`, `bank_account_no`, `bank_name`, `bank_account_name`).

**Lưu ý multi-tenant (QA-1)**: mỗi tenant một database. `TENANT_DATABASES="tenant_demo=bizonedb,…"` (host/credential lấy từ `DATABASE_URL`); tenant không có trong danh sách → 403. `getPrisma()` chỉ chạy trong `runWithTenant()` (tRPC, POS WS, worker, SSE đã bọc sẵn) — code mới ở entry point khác (route handler, job, script) phải tự bọc, dùng `getPrismaForTenant()` cho script/health. Key/kênh Redis phải có tenant (`pos:cart:{tenant}:{session}`, `bizone:pos:{tenant}:{session}`, `bizone:low-stock:{tenant}`); job BullMQ mang `tenantId`. Seed: `SEED_TENANT_ID=<tenant> npm run db:seed`.

**Lưu ý Prisma 7**: model PascalCase + `@@map` về tên bảng snake_case của `database/schema.sql`. Dùng `getPrisma()` từ `lib/prisma.ts`; import type từ `@/generated/prisma/client`. Đổi schema → tạo migration mới trong `prisma/migrations/`. Ghi đè DB đích bằng biến shell: `DATABASE_URL=... npx prisma ...`.

### Chạy Payment Hub (`source/payment-hub`)

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Next app port 4000 |
| `npm run dev:worker` / `npm run dev:realtime` | BullMQ worker / WebSocket relay (tsx watch, đọc `.env.local`) |
| `npm run build` + `npm run build:jobs` | Build Next + bundle worker/relay ra `dist/` |
| `npm test` / `npm run apikey:create -- <MERCHANT_CODE>` | Vitest / cấp API key merchant (in key + secret một lần, lưu secret mã hoá) |
| `docker compose up -d --build` | app :4000, realtime :4001, worker, MariaDB 10.11 (host 3308), Redis (host 6381) |

**Lưu ý connector (P3.3)**: secret đối tác trong `partner_configs` mã hoá bằng `PARTNER_ENCRYPTION_KEY` (base64 32 byte, có trong `.env.local`); `npm run db:seed` tạo partner config "VNPay Sandbox" từ `VNPAY_*`. `/api/ipn/*` public (không JWT); `/api/v1/*` có `X-Api-Key` xác thực HMAC ở route handler. IPN là nguồn sự thật — redirect không đổi trạng thái.

**Lưu ý VietQR (P3.4)**: tài khoản nhận lấy từ `partner_configs` `connector_type='VietQR'` Active — `api_key` = BIN ngân hàng (mã hoá), `merchant_code` = số tài khoản, `secret_key` = tên chủ TK (mã hoá); seed từ `VIETQR_BANK_BIN/ACCOUNT_NO/ACCOUNT_NAME` (hiện là **tài khoản demo**). Nội dung CK = `txn_code` bỏ dấu `-`. Mỗi (GD, loại, size) có 1 QR hiện hành; cache Redis `payhub:qr:{txnId}:{type}:{size}`, ảnh `payhub:qr:img:{token}`; worker đánh dấu QR hết hạn mỗi phút. Rate limit QR 60 req/phút/key.

**Lưu ý đối tác (P3.5)**: cấu hình mới luôn `Inactive`; chỉ kích hoạt khi test kết nối của cấu hình hiện tại đạt; sửa trường kết nối → xoá kết quả test và về `Inactive`. API không bao giờ trả secret (che `••••`). Metadata từng loại connector ở `lib/partner-types.ts`. Log `partner_config_logs.changed_by` = username token.

**Lưu ý webhook (P3.6)**: đổi trạng thái cuối của GD phải đặt `OUTBOX_PENDING` (`notify_webhook=1, webhook_sent_at=NULL`) trong cùng DB transaction rồi gọi `dispatchSoon(txnId)` sau commit; worker quét outbox mỗi 30 s. Ký `X-Signature = HMAC-SHA256(secret, X-Timestamp + "." + body)`, `X-Webhook-Id` giữ nguyên qua retry/replay. Job BullMQ không mang secret. Dev cần `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` (Payment Hub) và `PAYHUB_WEBHOOK_SECRET` (BizOne).

**Lưu ý realtime**: Route Handlers của Next không giữ được WebSocket → dùng process `realtime` riêng; app gửi event bằng `publishEvent()` qua Redis pub/sub (mọi event phải có `merchantId`). WS yêu cầu token qua subprotocol `["payhub-events", token]`, role `payhub-admin`/`payhub-viewer`.

**Lưu ý bảo mật Payment Hub**: merchant API (`/api/v1/*` có `X-Api-Key`) ký `hex(HMAC-SHA256(secret, METHOD\nPATH?QUERY\nTS\nhex(SHA256(body))))` (`lib/hmac.ts`, theo OpenAPI); `api_secret` lưu `enc:v1:` (AES-256-GCM, `PARTNER_ENCRYPTION_KEY`). Admin API `/api/internal/*` dùng `requireAdmin()`; token có claim `merchant_id` chỉ thấy merchant đó. `proxy.ts` xoá header `x-user-*` do client gửi. Đổi trạng thái giao dịch luôn bằng `UPDATE … WHERE status = <đã đọc>`.

**Gọi tRPC từ client**: truyền header mỗi call `trpc.x.y.query(input, { context: { headers } })` (helper `apiContext(auth)` trong `components/inventory/shared.ts`). Chưa có đăng nhập OIDC trên trình duyệt — page lấy `DEV_TENANT_ID` / `DEV_AUTH_TOKEN` từ env qua `getDevAuth()`. Next 16 không cho 2 `next dev` cùng thư mục: nếu :3000 đang chạy, test bằng `npm run build && npx next start -p 3001`.

**Lưu ý NextJS 16**: API và convention khác bản cũ — đọc `source/bizone/node_modules/next/dist/docs/` trước khi viết code. `cacheComponents: true` đang bật: route/page cần dữ liệu theo request phải dùng `await connection()` hoặc Request-time APIs.

**Lưu ý Docker**: container Keycloak thuộc compose project `bizone` (repo root). Không chạy `docker compose down --remove-orphans` trong project khác trùng tên. Host port đã dùng: 3000 (BizOne), 3002 (BizOne POS WebSocket), 3306/6379 (MariaDB/Redis local), 3307/6380 (`bizone-core`), 3308/6381 (`bizone-payhub`), 4000/4001 (Payment Hub), 8080 (Keycloak), 9000/9001 (MinIO).

**Metabase**: không thuộc dự án (không có trong BRD/SRS/PLAN). Báo cáo được xây trong app (P2.9, P4.2, P5.5). Container `metabase` trên máy đã dừng — không khởi động lại, không phụ thuộc vào nó.

**Phiên bản MariaDB & Keycloak** (cập nhật 2026-11-03):
- **MariaDB 10.11 LTS ở mọi nơi**: dev local (container `mariadbtest`, cổng 3306, volume `mariadbtest-10.11-data`, restart policy `unless-stopped`), Docker compose của 2 app, production. Server mặc định `utf8mb4` / `utf8mb4_unicode_ci`. Được dùng tính năng 10.11 (`INSERT … RETURNING`, `SKIP LOCKED`, `JSON_TABLE`, kiểu `UUID`…).
- `mariadbtest` dùng chung với dự án khác (`jasperserver`, `openapidb`): không xoá/reset DB của dự án khác.
- **Keycloak 26.8.1** (`docker-compose.keycloak.yml`): admin bootstrap qua `KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD`; health/metrics ở management port **9000** trong container (không publish ra host vì MinIO dùng 9000). Token Exchange v1 (`KC_FEATURES=token-exchange`) đã deprecated — P1.5 không xây trên nó (xem `documents/OAuth2-Keycloak-Spec.md` §5.2).
- Rollback (giữ tạm, xoá khi chắc chắn không cần): container `mariadbtest-10.3` (đã dừng) + volume gốc `0da92de461be…` còn nguyên dữ liệu 10.3. Khôi phục: dừng `mariadbtest`, `docker rename mariadbtest-10.3 mariadbtest`, start, và đổi Keycloak về 23.0.7.
- Cột `updated_at`: dùng `@updatedAt` của Prisma (không có `ON UPDATE CURRENT_TIMESTAMP` ở DB) — SQL thuần phải tự set `updated_at`.

**Quy trình**: xem mục *Quy trình xây dựng & phát triển* ở đầu file (B1–B6).

---

## Stack kỹ thuật

| Component | Technology |
|-----------|-----------|
| Framework | NextJS 16 App Router (React 19, Turbopack, `cacheComponents`) |
| API | tRPC (BizOne) / REST (Payment Hub) |
| ORM | Prisma |
| DB | MariaDB 10.11 LTS (dev local, Docker compose, production) |
| Cache/Queue | Redis + BullMQ |
| Auth | Keycloak 26.8.1 (OIDC) — realms `bizone`, `payment-hub`, `partners`; access token 15 phút + refresh 7 ngày. Xem `documents/OAuth2-Keycloak-Spec.md` |
| Storage | MinIO/S3 |
| Real-time | WebSocket + BroadcastChannel API |
| Validation | Zod |
| UI | TailwindCSS + shadcn/ui |

---

## Cấu hình môi trường (env.txt)

| Service | Host | Port | Credentials |
|---------|------|------|-------------|
| MariaDB BizOne | localhost | 3306 | root/mypass → bizonedb |
| MariaDB PayHub | localhost | 3306 | root/mypass → paymentdb |
| Redis | localhost | 6379 | password: 123456 |
| MinIO | localhost | 9000/9001 | admin/123456a@ → bucket: bizone |
| Keycloak | localhost | 8080 | admin console: xem `documents/env.txt` / `.env.development` |

---

## Modules BizOne (12 modules)

1. **POS (Bán hàng)** — dual-screen, WebSocket sync, mã vạch, thanh toán đa phương thức
2. **Quản lý Sản phẩm** — SKU, variants, categories (5 cấp), combo, import/export Excel
3. **Quản lý Kho** — nhập/xuất/chuyển kho, kiểm kê, cảnh báo tồn thấp, lô/HSD
4. **CRM** — lịch sử mua hàng, tích điểm, xếp hạng (Silver/Gold/VIP/Diamond), công nợ
5. **Quản lý Đơn hàng** — online/offline, tracking, đổi trả, kết nối GHN/GHTK
6. **Quản lý Nhân viên** — ca làm việc, chấm công, hoa hồng, RBAC chi tiết
7. **Báo cáo & Phân tích** — doanh thu, lợi nhuận, hàng chạy/chậm, export PDF/Excel
8. **Quản lý Nhà cung cấp** — purchase orders, công nợ NCC, so sánh giá nhập
9. **Omni Channel** — Website, Shopee, Lazada, TikTok Shop, Facebook, Zalo
10. **Kế toán & Tài chính** — quỹ tiền mặt, thu/chi, sổ quỹ, đối soát
11. **Marketing & Khuyến mãi** — coupon, flash sale, Buy X Get Y, campaign SMS/Email/Zalo
12. **Cài đặt & Cấu hình** — multi-branch, RBAC, notifications, templates

---

## Modules Payment Hub (8 modules)

1. **Transaction Engine** — state machine: Created→Pending→Success/Failed/Expired→Refunded
2. **Connector Engine** — hot-plug architecture, VNPay / MoMo / ZaloPay / VietQR
3. **Webhook Engine** — BullMQ async, retry 5 lần (exponential backoff), HMAC-SHA256
4. **Refund Module** — full/partial refund, multiple partial accumulation
5. **Reconciliation** — đối soát hàng ngày 00:00, matched/unmatched/amount_mismatch
6. **Dispute Module** — tra soát, đính kèm file, gửi đối tác
7. **Dashboard & Reports** — real-time WebSocket, export Excel/PDF/CSV
8. **Audit Log** — append-only, 90 ngày, không thể xóa/sửa

---

## Kế hoạch triển khai (PLAN.md)

| Giai đoạn | Tuần | Nội dung |
|-----------|------|---------|
| 1 — Nền tảng | 1–3 | Scaffolding, Docker, DB schema, Auth, API core, UI library |
| 2 — BizOne Core MVP | 4–8 | POS, Product, Inventory, Orders, CRM, Dashboard, Audit Log |
| 3 — Payment Hub MVP | 4–8 | Txn Engine, VNPay, VietQR, Webhook (song song với GĐ 2) |
| 4 — BizOne Mở rộng | 9–12 | Staff, Reports, Suppliers, Marketing, POS nâng cao, Multi-store |
| 5 — PayHub Mở rộng | 9–12 | MoMo, ZaloPay, Refund, Reconciliation, Reports (song song GĐ 4) |
| 6 — Nâng cao | 13–16 | Omni Channel, PWA Mobile, Performance, Security Hardening |

---

## Tài liệu dự án

| File | Mô tả |
|------|-------|
| `documents/BRD-BizOne.md` | Business Requirements Document — BizOne |
| `documents/SRS-BizOne.md` | Software Requirements Specification — BizOne (12 modules) |
| `documents/URD-BizOne.md` | User Requirements Document — personas & use cases |
| `documents/API-Design-BizOne.md` | Chi tiết API endpoints BizOne |
| `documents/BRD-PaymentHub.md` | BRD — Payment Hub |
| `documents/SRS-PaymentHub.md` | SRS — Payment Hub (8 modules) |
| `documents/URD-PaymentHub.md` | URD — Payment Hub personas |
| `documents/API-Design-PaymentHub.md` | Chi tiết API endpoints Payment Hub |
| `database/schema.sql` | Schema MariaDB cho BizOne |
| `database/schema_paymenthub.sql` | Schema MariaDB cho Payment Hub |
| `database/migration_001_connector_plugin.sql` | Migration connector plugin |
| `PLAN.md` | Kế hoạch xây dựng chi tiết 6 giai đoạn với prompts AI agent |
| `mockups-bizone/` | UI mockups 8 màn hình BizOne (HTML) |
| `mockups-paymenthub/` | UI mockup Payment Hub Admin (HTML) |
| `documents/env.txt` | Biến môi trường và cấu hình |

---

## Knowledge Graph (graphify)

Graph đã được build tại `graphify-out/`:
- **135 nodes · 154 edges · 27 communities**
- `graphify-out/graph.html` — interactive visualization
- `graphify-out/GRAPH_REPORT.md` — full analysis report
- `graphify-out/graph.json` — raw data cho GraphRAG

### God Nodes (điểm kết nối trung tâm)
1. `BizOne and Payment Hub Build Plan` (PLAN.md) — 17 edges — **điểm tham chiếu chính**
2. `BizOne Platform` — 14 edges
3. `BizOne SRS Document` — 14 edges
4. `Software Architecture Design Skill` — 12 edges
5. `Payment Hub API Design Document` — 10 edges

### Surprising Connections (phát hiện từ graph)
- **Transaction State Machine ↔ Saga Pattern** — Payment Hub state machine có thể implement theo Saga pattern cho distributed transactions
- **Transactional Outbox ↔ Webhook Delivery** — pattern outbox và webhook retry giải quyết cùng vấn đề at-least-once delivery
- **Circuit Breaker ↔ Payment Hub Route Engine** — route engine cần tích hợp circuit breaker để graceful degradation khi đối tác lỗi
- **POS WebSocket ↔ BizOne POS** — dual-screen sync đã được spec trong API Design

### Cập nhật graph
```bash
cd /Users/steve/Data/working/bizone
graphify . --update    # incremental update khi có file mới/thay đổi
```

---

## Thiết kế UI

| Color Token | Value | Dùng cho |
|-------------|-------|----------|
| primary | #2563EB | Nút chính, links |
| success | #10B981 | Trạng thái thành công |
| warning | #F59E0B | Cảnh báo |
| error | #EF4444 | Lỗi |
| Font | Inter | Toàn bộ UI |

POS UI: button tối thiểu 44×44px, font 16px+, numeric keypad lớn.

---

## Personas chính

| Persona | Vai trò | Màn hình chính |
|---------|---------|----------------|
| Anh Minh (Owner) | Chủ cửa hàng | Dashboard, Reports |
| Chị Lan (Manager) | Quản lý | Products, Warehouse, Staff |
| Bạn Tuấn (Seller) | Nhân viên bán hàng | POS |
| Khách hàng | Người mua | Customer Display (POS) |

---

## Conventions

- Response format API: `{ success, data, meta }` (thành công) / `{ success, error: { code, message, details } }` (lỗi)
- Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`
- Multi-tenant: mọi request cần header `X-Tenant-ID`
- Rate limit: 100 req/min (general), 300 req/min (POS), 10 req/min (auth)
- Pagination: bắt buộc cho mọi list endpoint, max 100/trang
- Idempotency key: bắt buộc cho mutation POS và Payment Hub (Redis TTL 24h)
- Auth: HMAC-SHA256 signature cho Payment Hub API (`X-Signature` header)

---

## Skills cài sẵn

| Skill | Path | Dùng khi |
|-------|------|----------|
| software-architecture-design | `.agents/skills/software-architecture-design/` | Thiết kế kiến trúc, ADR |
| frontend-design | `.agents/skills/frontend-design/` | Thiết kế UI/UX |
