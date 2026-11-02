# CLAUDE.md — BizOne Project

## Tổng quan dự án

**BizOne** là nền tảng quản lý bán hàng All-In-One (Omni Channel POS) dành cho SME Việt Nam.
**Payment Hub** là hệ thống trung gian thanh toán tập trung phục vụ hệ sinh thái BizOne.

Hai hệ thống độc lập, triển khai song song, giao tiếp qua REST API + Webhook.

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
├── .env.development                 # credentials dev toàn hệ thống (gitignored)
├── .env.example                     # template env toàn hệ thống (commit)
├── docker-compose.keycloak.yml      # Keycloak 23 (port 8080, DB keycloakdb), compose project "bizone"
├── keycloak/realms/                 # realm import: bizone / payment-hub / partners
├── database/                        # SQL schema gốc (schema.sql, schema_paymenthub.sql, migrations)
├── documents/                       # BRD, SRS, URD, API design, OpenAPI YAML, OAuth2/Keycloak spec, env.txt
├── mockups-bizone/                  # 8 màn hình HTML BizOne
├── mockups-paymenthub/              # mockup HTML Payment Hub Admin
├── graphify-out/                    # knowledge graph (graph.html, graph.json, GRAPH_REPORT.md)
├── .agents/skills/                  # skills: software-architecture-design, frontend-design
└── source/                          # MÃ NGUỒN ỨNG DỤNG
    ├── bizone/                      # P1.1 — BizOne Core (NextJS 16)
    │   ├── app/                     # App Router: pages, layouts, route handlers
    │   │   ├── api/health/route.ts  # GET /api/health (Docker healthcheck)
    │   │   ├── layout.tsx           # root layout, font Inter, lang="vi"
    │   │   ├── page.tsx
    │   │   └── globals.css          # Tailwind v4 + shadcn theme (primary #2563EB, success/warning/info)
    │   ├── components/ui/           # shadcn/ui components (style base-nova)
    │   ├── hooks/                   # React hooks dùng chung
    │   ├── lib/                     # tiện ích dùng chung (utils.ts: cn())
    │   ├── server/                  # tRPC routers, services, middleware (P1.6)
    │   ├── types/                   # TypeScript types dùng chung
    │   ├── public/                  # static assets
    │   ├── Dockerfile               # multi-stage, output standalone, node:24-alpine
    │   ├── docker-compose.yml       # project "bizone-core": app + db (MariaDB 10.11) + cache (Redis 7)
    │   ├── .env.local               # env dev của app (gitignored)
    │   ├── .env.example             # template env của app
    │   ├── .prettierrc / eslint.config.mjs / tsconfig.json / components.json
    │   └── AGENTS.md                # do `next dev` tự sinh — đọc docs trong node_modules/next/dist/docs
    └── payment-hub/                 # P1.2 — (chưa tạo)
```

### Chạy BizOne app (`source/bizone`)

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Dev server (mặc định port 3000 — đang bị Metabase chiếm, dùng `npx next dev -p 3010`) |
| `npm run build` / `npm start` | Build & chạy production |
| `npm run lint` / `npm run typecheck` / `npm run format` | ESLint / tsc / Prettier |
| `docker compose up -d --build` | app + MariaDB 10.11 (host 3307) + Redis (host 6380); `APP_PORT=3010` để đổi port app |

**Lưu ý NextJS 16**: API và convention khác bản cũ — đọc `source/bizone/node_modules/next/dist/docs/` trước khi viết code. `cacheComponents: true` đang bật: route/page cần dữ liệu theo request phải dùng `await connection()` hoặc Request-time APIs.

**Lưu ý Docker**: container Keycloak thuộc compose project `bizone` (repo root). Không chạy `docker compose down --remove-orphans` trong project khác trùng tên.

---

## Stack kỹ thuật

| Component | Technology |
|-----------|-----------|
| Framework | NextJS 16 App Router (React 19, Turbopack, `cacheComponents`) |
| API | tRPC (BizOne) / REST (Payment Hub) |
| ORM | Prisma |
| DB | MariaDB 10.11 |
| Cache/Queue | Redis + BullMQ |
| Auth | Keycloak 23 (OIDC) — realms `bizone`, `payment-hub`, `partners`; access token 15 phút + refresh 7 ngày. Xem `documents/OAuth2-Keycloak-Spec.md` |
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
