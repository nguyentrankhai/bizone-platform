# BizOne — Omni Channel POS & Management Platform

> All-in-One Omni Channel POS platform for Vietnamese SMEs  
> Nền tảng quản lý bán hàng All-in-One đa kênh cho doanh nghiệp vừa và nhỏ Việt Nam

---

## 🇬🇧 English

### Overview

BizOne is a SaaS platform that helps Vietnamese SMEs manage their sales operations across multiple channels from a single, unified system. It combines a Point-of-Sale (POS) system, inventory management, CRM, reporting, and e-commerce channel synchronization with centralized payment processing through a dedicated Payment Hub.

### System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    BizOne Platform                       │
│                                                          │
│  ┌─────────────────────┐   ┌────────────────────────┐   │
│  │   BizOne Core API    │   │    Payment Hub API      │   │
│  │   (NextJS App Router)│   │   (Express / Node.js)   │   │
│  │   Port: 3000        │   │   Port: 4000            │   │
│  └──────────┬──────────┘   └───────────┬────────────┘   │
│             │                          │                  │
│  ┌──────────┴──────────┐   ┌───────────┴────────────┐   │
│  │  MariaDB: bizonedb  │   │  MariaDB: paymentdb     │   │
│  │  Redis (cache/queue)│   │  Redis (idempotency)    │   │
│  │  BullMQ (async jobs)│   │  BullMQ (webhooks)      │   │
│  │  MinIO (file storage│   │                         │   │
│  └─────────────────────┘   └────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Keycloak (Identity Provider)         │   │
│  │   Realm: bizone | payment-hub | partners         │   │
│  │   Port: 8080                                     │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Modules

**BizOne Core (12 modules)**
| Module | Description |
|--------|-------------|
| POS | Point-of-sale with cash sessions, invoicing, returns & exchanges, split/merge bills, pre-orders with deposit, card/QR via Payment Hub, PIN-paired customer display, ESC/POS printing |
| Products | Product catalog, variants, multi-unit, barcode |
| Inventory | Multi-warehouse, stock transactions, batch/expiry tracking |
| Customers (CRM) | Customer groups, loyalty points, debt management |
| Orders | Unified order management across all channels |
| Staff | Role-based access control, shift management |
| Suppliers | Purchase orders, supplier debt |
| Reports | Revenue, inventory, customer analytics |
| Marketing | Promotions, coupons, loyalty programs |
| Omni Channel | Shopee, Lazada, TikTok Shop, Facebook Shops sync |
| Accounting | Cash flow, accounts payable/receivable |
| Dashboard | Real-time KPI overview |

**Payment Hub (8 modules)**
| Module | Description |
|--------|-------------|
| Transactions | Centralized payment processing (hot-plug connector architecture) |
| QR Payments | VietQR, MoMo, ZaloPay QR generation |
| Refunds | Full/partial refund processing |
| PSP Connectors | VNPay, MoMo, ZaloPay, VietQR adapters + signed, sandboxed third-party connector plugins (see `documents/Connector-Plugin-Guide.md`) |
| Merchant API | HMAC-SHA256 authenticated API for BizOne |
| Admin Console | Dashboard, transaction monitoring, PSP config |
| Webhooks | Inbound PSP callbacks + outbound event notifications |
| Reports | Payment analytics, success rates, revenue reconciliation |
| Disputes | Transaction disputes: evidence files (MinIO/S3), sent to the PSP by e-mail or recorded manually, status tracking, result notification (e-mail + `dispute.resolved` webhook) |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend / API | NextJS 14+ App Router |
| Internal API | tRPC (type-safe, no schema drift) |
| External API | REST / OpenAPI 3.0 |
| ORM | Prisma |
| Database | MariaDB (bizonedb + paymentdb) |
| Cache | Redis 7+ |
| Job Queue | BullMQ |
| File Storage | MinIO (S3-compatible) |
| Authentication | Keycloak (OAuth 2.0 / OpenID Connect) |
| Real-time | WebSocket (POS dual-screen sync) |

### Authentication

BizOne uses **Keycloak** as a centralized Identity Provider:

- **BizOne Staff/Admin**: Authorization Code + PKCE → JWT Bearer tokens
- **Machine-to-Machine (BizOne ↔ PayHub)**: Client Credentials flow
- **Payment Hub Admin**: JWT Bearer (realm `payment-hub`)
- **Third-party Integrations**: Authorization Code + PKCE (realm `partners`)
- **Omni Channel (Shopee/Lazada/TikTok)**: Outbound OAuth to each platform

### API Documentation

| Document | Description |
|----------|-------------|
| [OpenAPI-BizOne.yaml](documents/OpenAPI-BizOne.yaml) | BizOne API spec (OpenAPI 3.0) |
| [OpenAPI-PaymentHub.yaml](documents/OpenAPI-PaymentHub.yaml) | Payment Hub API spec (OpenAPI 3.0) |
| [OAuth2-Keycloak-Spec.md](documents/OAuth2-Keycloak-Spec.md) | OAuth 2.0 & Keycloak configuration |
| [API-Design-BizOne.md](documents/API-Design-BizOne.md) | BizOne API design guidelines |
| [API-Design-PaymentHub.md](documents/API-Design-PaymentHub.md) | Payment Hub API design guidelines |

### Getting Started

**Prerequisites**: Node.js 24+, MariaDB 10.11, Redis 7+, Docker (Keycloak 26.8.1 runs in Docker)

```bash
# Clone repository
git clone https://github.com/your-org/bizone.git
cd bizone

# Copy environment config
cp documents/env.txt .env.local
# Edit .env.local with your values

# Start infrastructure
docker compose up -d mariadb redis minio keycloak
# Keycloak — secrets come from the env file (P6.6, no passwords in compose files)
docker compose --env-file .env.development -f docker-compose.keycloak.yml up -d

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

**Default ports:**
- BizOne: http://localhost:3000 (POS + notification WebSocket `ws://localhost:3002/ws/pos/{sessionId}`, `/ws/notifications` — `npm run dev:realtime`; BullMQ worker incl. email/SMS/push and scheduled reminders — `npm run dev:worker`). Email (`SMTP_*`), SMS gateway (`SMS_*`) and Web Push (`VAPID_*`) default to log / off when not configured. One database per tenant: set `TENANT_DATABASES` (e.g. `tenant_demo=bizonedb`).
- Checks (same as CI): `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
- Payment Hub: http://localhost:4000
- Online store (P6.1, `source/storefront`): http://localhost:3100 (`npm run dev`) — `{store}.bizone.vn` in production. In BizOne go to **Omni Channel → Website**, save the settings and create a store key, then put it in the storefront's `.env.local` (`STORE_KEYS="demo=bzs.…"`, see `.env.example`). Online payment goes through Payment Hub with BizOne's merchant key (`PAYHUB_*`).
- Shopee / Lazada (P6.2): **Omni Channel → Shopee / Lazada** — save the settings, then **Connect** (OAuth on the marketplace). Needs BizOne's platform apps in BizOne's `.env.local` (`SHOPEE_PARTNER_ID/KEY`, `LAZADA_APP_KEY/SECRET`, `OMNI_TOKEN_KEY`) and a public `APP_URL` for the OAuth return + push (`/api/webhooks/shopee|lazada`); listings, stock (≤ 30 s) and orders sync in `npm run dev:worker`.
- TikTok Shop / Facebook – Instagram (P6.3): same flow at **Omni Channel → TikTok Shop / Facebook / Instagram** (`TIKTOK_APP_KEY/SECRET/SERVICE_ID`, `FACEBOOK_APP_ID/SECRET`; TikTok webhook `/api/webhooks/tiktok`). The Facebook catalog links each product to the website channel (`utm_source=facebook`), so those orders arrive as website orders tagged with their source.
- Owner mobile app / PWA (P6.4): open http://localhost:3000/mobile on a phone (dashboard, orders, reports, notifications; works offline with the last data) and install it ("Install app" on Chrome / Android, Share → "Add to Home Screen" on iPhone). Offline caching is on in production builds only (`npm run build && npm start`); push needs `VAPID_PUBLIC_KEY/PRIVATE_KEY` (`npx web-push generate-vapid-keys`), `npm run dev:worker` and HTTPS (or `localhost`).
- Performance check (P6.5): `source/bizone/scripts/perf/README.md` — load a 200 000-invoice test database into a separate tenant and measure API P50 / P95 with `node scripts/perf/bench.mjs`; index review in `scripts/database-indexing.sql`.
- Keycloak: http://localhost:8080
- MinIO Console: http://localhost:9001
- Sign-in: both web apps redirect to Keycloak (Authorization Code + PKCE — BizOne client `bizone-frontend`, Payment Hub Admin client `payhub-admin-console`); dev users are in `keycloak/realms/*.json`. Scripts / tests get a token with `KC_PASSWORD=… node scripts/auth/login.mjs --user <username>` (in each app).

### Build Plan

The project is organized in 6 phases (see [PLAN.md](PLAN.md)):

| Phase | Focus |
|-------|-------|
| P1 | Foundation: Auth, multi-tenant, core DB schema |
| P2 | POS & Products: Core selling functionality |
| P3 | Inventory & CRM: Warehouse and customer management |
| P4 | Payment Hub: Centralized payment gateway |
| P5 | Reporting & Marketing: Analytics and promotions |
| P6 | Omni Channel: E-commerce platform integrations |

---

## 🇻🇳 Tiếng Việt

### Tổng quan

BizOne là nền tảng SaaS giúp doanh nghiệp vừa và nhỏ (SME) Việt Nam quản lý hoạt động bán hàng trên nhiều kênh từ một hệ thống thống nhất. Kết hợp POS (bán hàng tại quầy), quản lý kho, CRM, báo cáo và đồng bộ sàn TMĐT với xử lý thanh toán tập trung qua Payment Hub.

### Kiến trúc hệ thống

Xem sơ đồ bên trên (phần tiếng Anh).

### Các module

**BizOne Core (12 module)**
| Module | Mô tả |
|--------|-------|
| POS | Bán hàng tại quầy: ca bán hàng, hóa đơn, đổi trả, tách/gộp hóa đơn, đặt trước + cọc, thẻ/QR qua Payment Hub, màn hình khách ghép PIN, in ESC/POS |
| Sản phẩm | Danh mục, biến thể, đa đơn vị, barcode |
| Kho hàng | Đa kho, nhập/xuất/chuyển kho, theo dõi lô/hạn dùng |
| Khách hàng (CRM) | Nhóm khách, tích điểm, quản lý công nợ |
| Đơn hàng | Quản lý đơn hàng thống nhất từ mọi kênh |
| Nhân viên | Phân quyền (RBAC), ca làm việc |
| Nhà cung cấp | Đặt hàng nhập, công nợ nhà cung cấp |
| Báo cáo | Doanh thu, kho, khách hàng |
| Marketing | Khuyến mãi, mã coupon, chương trình thành viên |
| Đa kênh | Đồng bộ Shopee, Lazada, TikTok Shop, Facebook Shops |
| Kế toán | Dòng tiền, phải thu/phải trả |
| Dashboard | Tổng quan KPI real-time |

**Payment Hub (8 module)**
| Module | Mô tả |
|--------|-------|
| Giao dịch | Xử lý thanh toán tập trung (kiến trúc connector hot-plug) |
| QR Thanh toán | Tạo QR VietQR, MoMo, ZaloPay |
| Hoàn tiền | Hoàn một phần / toàn phần |
| PSP Connectors | Kết nối VNPay, MoMo, ZaloPay, VietQR + connector plugin bên thứ ba (ký số, chạy sandbox — `documents/Connector-Plugin-Guide.md`) |
| Merchant API | API xác thực HMAC-SHA256 cho BizOne |
| Admin Console | Dashboard, theo dõi giao dịch, cấu hình PSP |
| Webhooks | Nhận callback từ PSP + gửi sự kiện ra ngoài |
| Báo cáo | Phân tích thanh toán, tỷ lệ thành công, đối soát |
| Tra soát | Tra soát giao dịch: đính kèm chứng từ (MinIO/S3), gửi đối tác qua email hoặc ghi nhận thủ công, theo dõi trạng thái, thông báo kết quả (email + webhook `dispute.resolved`) |

### Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Frontend / API | NextJS 14+ App Router |
| API nội bộ | tRPC (type-safe, không lệch schema) |
| API công khai | REST / OpenAPI 3.0 |
| ORM | Prisma |
| Cơ sở dữ liệu | MariaDB (bizonedb + paymentdb) |
| Cache | Redis 7+ |
| Hàng đợi | BullMQ |
| Lưu trữ file | MinIO (tương thích S3) |
| Xác thực | Keycloak (OAuth 2.0 / OpenID Connect) |
| Real-time | WebSocket (POS dual-screen) |

### Xác thực & Phân quyền

BizOne dùng **Keycloak** làm Identity Provider trung tâm:

- **Nhân viên/Quản lý BizOne**: Authorization Code + PKCE → JWT Bearer token
- **Máy chủ đến máy chủ (BizOne ↔ PayHub)**: Client Credentials flow
- **Admin Payment Hub**: JWT Bearer (realm `payment-hub`)
- **Tích hợp bên thứ ba**: Authorization Code + PKCE (realm `partners`)
- **Kết nối sàn TMĐT (Shopee/Lazada/TikTok)**: Outbound OAuth đến từng sàn

### Tài liệu API

| Tài liệu | Mô tả |
|----------|-------|
| [OpenAPI-BizOne.yaml](documents/OpenAPI-BizOne.yaml) | Đặc tả API BizOne (OpenAPI 3.0) |
| [OpenAPI-PaymentHub.yaml](documents/OpenAPI-PaymentHub.yaml) | Đặc tả API Payment Hub (OpenAPI 3.0) |
| [OAuth2-Keycloak-Spec.md](documents/OAuth2-Keycloak-Spec.md) | Cấu hình OAuth 2.0 & Keycloak |
| [API-Design-BizOne.md](documents/API-Design-BizOne.md) | Nguyên tắc thiết kế API BizOne |
| [API-Design-PaymentHub.md](documents/API-Design-PaymentHub.md) | Nguyên tắc thiết kế API Payment Hub |
| [SRS-BizOne.md](documents/SRS-BizOne.md) | Đặc tả yêu cầu phần mềm BizOne |
| [SRS-PaymentHub.md](documents/SRS-PaymentHub.md) | Đặc tả yêu cầu phần mềm Payment Hub |
| [BRD-BizOne.md](documents/BRD-BizOne.md) | Yêu cầu kinh doanh |

### Cài đặt nhanh

**Yêu cầu**: Node.js 24+, MariaDB 10.11, Redis 7+, Docker (Keycloak 26.8.1 chạy trong Docker)

```bash
# Clone repository
git clone https://github.com/your-org/bizone.git
cd bizone

# Sao chép cấu hình môi trường
cp documents/env.txt .env.local
# Chỉnh sửa .env.local theo môi trường của bạn

# Khởi động hạ tầng
docker compose up -d mariadb redis minio keycloak
# Keycloak — secret lấy từ env file (P6.6, compose không chứa mật khẩu)
docker compose --env-file .env.development -f docker-compose.keycloak.yml up -d

# Cài đặt dependencies
npm install

# Chạy database migrations
npx prisma migrate dev

# Khởi động development server
npm run dev
```

**Cổng mặc định:**
- BizOne: http://localhost:3000 (POS WebSocket `ws://localhost:3002/ws/pos/{sessionId}` — `npm run dev:realtime`; worker BullMQ — `npm run dev:worker`). Mỗi tenant một database: khai báo `TENANT_DATABASES` (vd. `tenant_demo=bizonedb`).
- Kiểm tra (giống CI): `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
- Payment Hub: http://localhost:4000
- Website bán hàng (P6.1, `source/storefront`): http://localhost:3100 (`npm run dev`) — production là `{cửa-hàng}.bizone.vn`. Trong BizOne vào **Omni Channel → Website**, lưu cấu hình và tạo khoá kết nối, rồi đặt vào `.env.local` của storefront (`STORE_KEYS="demo=bzs.…"`, xem `.env.example`). Thanh toán online đi qua Payment Hub bằng merchant key của BizOne (`PAYHUB_*`).
- Shopee / Lazada (P6.2): **Omni Channel → Shopee / Lazada** — lưu cài đặt rồi bấm **Kết nối** (OAuth trên sàn). Cần ứng dụng của BizOne trên sàn trong `.env.local` (`SHOPEE_PARTNER_ID/KEY`, `LAZADA_APP_KEY/SECRET`, `OMNI_TOKEN_KEY`) và `APP_URL` public cho OAuth + push (`/api/webhooks/shopee|lazada`); đăng SP, tồn kho (≤ 30 giây), đơn hàng đồng bộ trong `npm run dev:worker`.
- TikTok Shop / Facebook – Instagram (P6.3): tương tự ở **Omni Channel → TikTok Shop / Facebook / Instagram** (`TIKTOK_APP_KEY/SECRET/SERVICE_ID`, `FACEBOOK_APP_ID/SECRET`; webhook TikTok `/api/webhooks/tiktok`). Catalog Facebook trỏ mỗi SP về website (`utm_source=facebook`) nên đơn đến là đơn website có ghi nguồn.
- App chủ cửa hàng / PWA (P6.4): mở http://localhost:3000/mobile trên điện thoại (tổng quan, đơn hàng, báo cáo, thông báo; mất mạng vẫn xem số liệu lần cuối) và cài lên màn hình chính ("Cài đặt ứng dụng" trên Chrome / Android, Chia sẻ → "Thêm vào MH chính" trên iPhone). Cache offline chỉ bật ở bản production (`npm run build && npm start`); thông báo đẩy cần `VAPID_PUBLIC_KEY/PRIVATE_KEY` (`npx web-push generate-vapid-keys`), `npm run dev:worker` và HTTPS (hoặc `localhost`).
- Đo hiệu năng (P6.5): `source/bizone/scripts/perf/README.md` — nạp DB thử 200 000 hoá đơn vào tenant riêng và đo P50 / P95 API bằng `node scripts/perf/bench.mjs`; rà soát index ở `scripts/database-indexing.sql`.
- Keycloak: http://localhost:8080
- MinIO Console: http://localhost:9001
- Đăng nhập: cả 2 web app chuyển sang Keycloak (Authorization Code + PKCE — BizOne client `bizone-frontend`, Payment Hub Admin client `payhub-admin-console`); user dev nằm trong `keycloak/realms/*.json`. Script / kiểm thử lấy token bằng `KC_PASSWORD=… node scripts/auth/login.mjs --user <username>` (trong từng app).

### Kế hoạch xây dựng

Dự án được chia thành 6 giai đoạn (xem [PLAN.md](PLAN.md)):

| Giai đoạn | Nội dung |
|-----------|----------|
| P1 | Nền tảng: Auth, multi-tenant, DB schema cốt lõi |
| P2 | POS & Sản phẩm: Chức năng bán hàng cơ bản |
| P3 | Kho hàng & CRM: Quản lý kho và khách hàng |
| P4 | Payment Hub: Cổng thanh toán tập trung |
| P5 | Báo cáo & Marketing: Phân tích và khuyến mãi |
| P6 | Đa kênh: Tích hợp sàn TMĐT |

---

## 📁 Cấu trúc dự án / Project Structure

```
bizone/
├── README.md                           # Tài liệu này / This file
├── CLAUDE.md                           # AI assistant context
├── PLAN.md                             # Build roadmap (6 phases)
├── PROGRESS.md                         # Task progress & test results
├── .env.example                        # Env template (copy → .env.development)
├── docker-compose.keycloak.yml         # Keycloak 26.8.1 (port 8080)
├── keycloak/realms/                    # Realm imports: bizone, payment-hub, partners
├── database/                           # SQL schemas (BizOne, Payment Hub)
├── mockups-bizone/                     # BizOne UI mockups (HTML)
├── mockups-paymenthub/                 # Payment Hub Admin mockup (HTML)
├── source/                             # Application source code
│   ├── bizone/                         # BizOne Core — NextJS 16 (P1.1)
│   │   ├── app/                        # App Router (pages, layouts, /api/*)
│   │   ├── components/ui/              # shadcn/ui components
│   │   ├── prisma/                     # Prisma schema, migrations (0_init … 10_perf_indexes), seed
│   │   ├── hooks/  lib/  server/  types/
│   │   ├── server/ws/pos.ts            # POS 2-screen + notifications WebSocket (:3002/ws/pos/{sessionId}, /ws/notifications)
│   │   ├── server/worker.ts            # BullMQ worker (inventory, commissions, report exports, notifications)
│   │   ├── Dockerfile                  # Standalone production image
│   │   └── docker-compose.yml          # app + MariaDB 10.11 + Redis 7
│   ├── storefront/                     # P6.1 — online store [store].bizone.vn, NextJS 16 (:3100), calls BizOne /api/store/v1
│   └── payment-hub/                    # Payment Hub — NextJS 16 (P1.2)
│       ├── app/  components/  lib/     # App Router UI + REST API
│       ├── services/queue|webhook/     # BullMQ queues, webhook delivery
│       ├── services/worker.ts          # BullMQ worker process
│       ├── server/ws/server.ts         # WebSocket relay (:4001/ws)
│       └── docker-compose.yml          # app + worker + realtime + MariaDB + Redis
├── documents/
│   ├── BRD-BizOne.md                   # Business Requirements
│   ├── SRS-BizOne.md                   # Software Requirements Spec
│   ├── SRS-PaymentHub.md               # Payment Hub Requirements
│   ├── URD-BizOne.md                   # User Requirements
│   ├── API-Design-BizOne.md            # API Design Guidelines
│   ├── API-Design-PaymentHub.md        # PayHub API Guidelines
│   ├── OpenAPI-BizOne.yaml             # ✨ OpenAPI 3.0 Spec (BizOne)
│   ├── OpenAPI-PaymentHub.yaml         # ✨ OpenAPI 3.0 Spec (PayHub)
│   ├── OAuth2-Keycloak-Spec.md         # ✨ OAuth 2.0 & Keycloak Spec
│   └── env.txt                         # Environment config template
└── graphify-out/
    ├── graph.html                       # Interactive knowledge graph
    ├── graph.json                       # GraphRAG-ready JSON
    └── GRAPH_REPORT.md                 # Knowledge graph report
```

---

*© 2026 BizOne. All rights reserved.*
