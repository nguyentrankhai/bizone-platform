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
| POS | Point-of-sale with cash session management, invoicing, returns |
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
| PSP Connectors | VNPay, MoMo, ZaloPay, VietQR adapters |
| Merchant API | HMAC-SHA256 authenticated API for BizOne |
| Admin Console | Dashboard, transaction monitoring, PSP config |
| Webhooks | Inbound PSP callbacks + outbound event notifications |
| Reports | Payment analytics, success rates, revenue reconciliation |

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

**Prerequisites**: Node.js 20+, MariaDB 10.6+, Redis 7+, Docker

```bash
# Clone repository
git clone https://github.com/your-org/bizone.git
cd bizone

# Copy environment config
cp documents/env.txt .env.local
# Edit .env.local with your values

# Start infrastructure
docker compose up -d mariadb redis minio keycloak

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

**Default ports:**
- BizOne: http://localhost:3000
- Payment Hub: http://localhost:4000
- Keycloak: http://localhost:8080
- MinIO Console: http://localhost:9001

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
| POS | Bán hàng tại quầy: ca bán hàng, hóa đơn, đổi trả |
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
| Hoàn tiền | Hoàn toàn phần / toàn phần |
| PSP Connectors | Kết nối VNPay, MoMo, ZaloPay, VietQR |
| Merchant API | API xác thực HMAC-SHA256 cho BizOne |
| Admin Console | Dashboard, theo dõi giao dịch, cấu hình PSP |
| Webhooks | Nhận callback từ PSP + gửi sự kiện ra ngoài |
| Báo cáo | Phân tích thanh toán, tỷ lệ thành công, đối soát |

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

**Yêu cầu**: Node.js 20+, MariaDB 10.6+, Redis 7+, Docker

```bash
# Clone repository
git clone https://github.com/your-org/bizone.git
cd bizone

# Sao chép cấu hình môi trường
cp documents/env.txt .env.local
# Chỉnh sửa .env.local theo môi trường của bạn

# Khởi động hạ tầng
docker compose up -d mariadb redis minio keycloak

# Cài đặt dependencies
npm install

# Chạy database migrations
npx prisma migrate dev

# Khởi động development server
npm run dev
```

**Cổng mặc định:**
- BizOne: http://localhost:3000
- Payment Hub: http://localhost:4000
- Keycloak: http://localhost:8080
- MinIO Console: http://localhost:9001

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

## 📁 Cấu trúc tài liệu / Document Structure

```
bizone/
├── README.md                           # Tài liệu này / This file
├── CLAUDE.md                           # AI assistant context
├── PLAN.md                             # Build roadmap (6 phases)
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
