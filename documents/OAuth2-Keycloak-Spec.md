# OAuth 2.0 & Keycloak Authentication Specification

> **Hệ thống xác thực trung tâm cho BizOne + Payment Hub**
> Version: 1.1.0 | Ngày: 2026-11-03 | Keycloak 26.8.1 · MariaDB 10.11

---

## 1. Tổng quan kiến trúc

BizOne sử dụng **Keycloak** làm Identity Provider (IdP) tập trung.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Keycloak Server                          │
│                   https://keycloak.bizone.vn                    │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │  Realm:      │   │  Realm:          │   │  Realm:        │  │
│  │  bizone       │   │  payment-hub      │   │  partners      │  │
│  │  (BizOne POS)│   │  (PayHub Admin)  │   │  (Shopee/..)   │  │
│  └──────────────┘   └──────────────────┘   └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                       │
    BizOne API           PayHub Admin API         Omni Channel
    (JWT Bearer)         (JWT Bearer)             (Authorization Code)
```

### 1.1 Các Realm Keycloak

| Realm | Mục đích | Client | Người dùng |
|-------|----------|--------|-----------|
| `bizone` | BizOne POS & Management Platform | `bizone-api`, `bizone-frontend`, `bizone-public` | Merchants, Staff |
| `payment-hub` | Payment Hub Admin | `payhub-api`, `payhub-admin-console` | PayHub operators |
| `partners` | OAuth cho đối tác tích hợp (Shopee, Lazada...) | Mỗi đối tác một client | Third-party developers |

---

## 2. Realm: `bizone`

### 2.1 Cấu hình Realm

```
Realm URL: https://keycloak.bizone.vn/realms/bizone
OIDC Discovery: https://keycloak.bizone.vn/realms/bizone/.well-known/openid-configuration
Authorization: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/auth
Token: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/token
Introspect: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/token/introspect
Userinfo: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/userinfo
JWKS: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/certs
End Session: https://keycloak.bizone.vn/realms/bizone/protocol/openid-connect/logout
```

**Token TTL:**
- Access Token: 15 phút
- Refresh Token: 7 ngày (rotation enabled)
- ID Token: 15 phút
- Session: 8 giờ (idle), 7 ngày (max)

### 2.2 Clients trong Realm `bizone`

#### `bizone-frontend` (Public Client — NextJS App)
```yaml
Client Type: public
Protocol: openid-connect
Grant Types:
  - authorization_code + PKCE (mandatory)
  - refresh_token
Redirect URIs:
  - http://localhost:3000/* (development)
  - https://app.bizone.vn/*
  - https://staging-app.bizone.vn/*
Web Origins: same as redirect URIs
PKCE: S256 (bắt buộc, plain bị từ chối)
Scopes: openid, profile, email, bizone:pos, bizone:products, bizone:reports
```

#### `bizone-api` (Confidential Client — NextJS API Routes / Server)
```yaml
Client Type: confidential
Protocol: openid-connect
Grant Types:
  - client_credentials (service-to-service)
  - token exchange (BizOne ↔ PayHub)
Client Secret: lưu trong env KEYCLOAK_CLIENT_SECRET
Service Account: enabled (roles: bizone-service)
```

#### `bizone-public` (Confidential Client — Third-party Developer API)
```yaml
Client Type: confidential
Protocol: openid-connect
Grant Types:
  - authorization_code + PKCE
  - refresh_token
Access Token Lifespan: 1 giờ
Refresh Token: 30 ngày
Scopes: (xem Section 4)
```

### 2.3 User Roles (Realm `bizone`)

```
Realm Roles:
  bizone-admin        → Quản trị tenant: mọi quyền
  bizone-manager      → Quản lý: xem báo cáo, cấu hình, không xóa dữ liệu
  bizone-seller       → Thu ngân: POS, xem sản phẩm, khách hàng
  bizone-warehouse    → Kho: nhập xuất kho, xem sản phẩm
  bizone-viewer       → Chỉ xem báo cáo và dashboard

Client Roles (bizone-api):
  pos:write           → Tạo hóa đơn, ca bán hàng
  products:write      → Thêm/sửa sản phẩm
  inventory:write     → Nhập/xuất kho
  customers:write     → Thêm/sửa khách hàng
  reports:read        → Đọc báo cáo
```

### 2.4 Custom JWT Claims (Protocol Mapper)

BizOne thêm custom claims vào JWT token:

```json
{
  "sub": "user-uuid-keycloak",
  "iss": "https://keycloak.bizone.vn/realms/bizone",
  "exp": 1735660800,
  "iat": 1735659900,
  "azp": "bizone-frontend",
  "realm_access": {
    "roles": ["bizone-seller"]
  },
  "resource_access": {
    "bizone-api": {
      "roles": ["pos:write", "products:read"]
    }
  },
  // Custom claims từ User Attributes:
  "tenant_id": "tenant_abc123",
  "branch_ids": [1, 2, 3],
  "full_name": "Nguyễn Văn A",
  "avatar_url": "https://cdn.bizone.vn/avatars/xxx.jpg"
}
```

**Cấu hình Protocol Mapper trong Keycloak:**

| Mapper Name | Type | User Attribute | Token Claim |
|-------------|------|---------------|-------------|
| tenant_id | User Attribute | tenant_id | tenant_id |
| branch_ids | User Attribute (JSON array) | branch_ids | branch_ids |
| full_name | User Attribute | full_name | full_name |

### 2.5 Multi-tenant với Keycloak

BizOne là SaaS multi-tenant. Mỗi merchant là một **tenant** trong cùng Realm `bizone`.

**Chiến lược**: Single Realm, phân biệt tenant qua User Attribute.

```
Keycloak User Attributes:
  tenant_id: "tenant_abc123"    # gắn khi tạo user
  branch_ids: "[1,2,3]"         # chi nhánh được phép truy cập

BizOne API validation:
  1. Verify JWT signature (JWKS)
  2. Extract tenant_id từ token claims
  3. So sánh với X-Tenant-ID header → 403 nếu mismatch
  4. Check branch_ids nếu endpoint cần branch-level permission
```

---

## 3. Realm: `payment-hub`

### 3.1 Cấu hình Realm

```
Realm URL: https://keycloak.bizone.vn/realms/payment-hub
OIDC Discovery: https://keycloak.bizone.vn/realms/payment-hub/.well-known/openid-configuration
```

**Token TTL:**
- Access Token: 30 phút (admin console dùng lâu hơn)
- Refresh Token: 8 giờ

### 3.2 Clients trong Realm `payment-hub`

#### `payhub-api` (Confidential)
```yaml
Grant Types: client_credentials
Service Account Roles: payhub-service
Dùng cho: internal service calls từ BizOne API sang PayHub
```

#### `payhub-admin-console` (Public)
```yaml
Grant Types: authorization_code + PKCE
Dùng cho: Admin web UI của Payment Hub
Roles: payhub-admin, payhub-viewer
```

### 3.3 Admin Roles

```
payhub-admin   → Toàn quyền: cấu hình PSP, xem/xử lý giao dịch, quản lý merchants
payhub-viewer  → Chỉ xem dashboard và giao dịch
```

---

## 4. Realm: `partners` (Third-party OAuth)

### 4.1 Mục đích

Cho phép ứng dụng bên thứ ba truy cập BizOne API thay mặt merchant.
Dùng cho: Shopee/Lazada/TikTok connectors, third-party POS integrations, accounting software.

### 4.2 Flow: Authorization Code + PKCE

```
Third-party App                 Merchant Browser              Keycloak (realm: partners)
      │                                │                              │
      │─── 1. Redirect to Keycloak ────►│                              │
      │    (with code_challenge)        │                              │
      │                                │──── 2. Login (merchant) ─────►│
      │                                │                              │
      │                                │◄─── 3. Consent Screen ───────│
      │                                │     (show requested scopes)  │
      │                                │                              │
      │                                │──── 4. Grant permission ─────►│
      │                                │                              │
      │◄─── 5. Redirect back with code──│                              │
      │                                │                              │
      │────────── 6. Exchange code for tokens (with code_verifier) ───►│
      │                                                               │
      │◄─────────── 7. access_token + refresh_token ──────────────────│
      │                                                               │
      │────────── 8. Call BizOne API (Bearer access_token) ──────────►BizOne API
```

### 4.3 Scopes cho Third-party

| Scope | Quyền |
|-------|-------|
| `pos:read` | Đọc hóa đơn, ca bán hàng |
| `pos:write` | Tạo, cập nhật hóa đơn |
| `products:read` | Đọc danh sách sản phẩm, tồn kho |
| `products:write` | Thêm, sửa sản phẩm |
| `inventory:read` | Đọc tồn kho |
| `inventory:write` | Nhập/xuất kho |
| `customers:read` | Đọc thông tin khách hàng |
| `customers:write` | Thêm, sửa khách hàng |
| `orders:read` | Đọc đơn hàng |
| `orders:write` | Cập nhật trạng thái đơn hàng |
| `reports:read` | Đọc báo cáo |
| `omni:sync` | Đồng bộ sản phẩm và đơn hàng đa kênh |
| `webhooks:write` | Quản lý webhook subscriptions |

### 4.4 Đăng ký đối tác mới

1. Đối tác đăng ký tại Developer Portal (portal.bizone.vn/developers)
2. BizOne tạo Keycloak client trong realm `partners`
3. Cấp `client_id` và `client_secret` (cho confidential clients)
4. Đối tác được dùng Authorization Code + PKCE

**Cấu hình client cho đối tác:**
```yaml
Client ID: partner_{partner_name}_{uuid_short}
Client Type: confidential (hoặc public cho mobile)
Grant Types:
  - authorization_code
  - refresh_token
Redirect URIs: (đối tác cung cấp khi đăng ký)
Consent Required: true
Access Token Lifespan: 1 giờ
Refresh Token: 30 ngày (rotation enabled)
```

---

## 5. BizOne ↔ PayHub: Machine-to-Machine (Client Credentials)

### 5.1 Flow

```
BizOne API Server                        Keycloak                    PayHub API
     │                                      │                            │
     │─── POST /token ─────────────────────►│                            │
     │    grant_type=client_credentials      │                            │
     │    client_id=bizone-api              │                            │
     │    client_secret=xxx                 │                            │
     │                                      │                            │
     │◄─── access_token (scope: payhub) ────│                            │
     │                                      │                            │
     │─── Authorization: Bearer {token} ───────────────────────────────►│
     │    POST /api/v1/transactions         │                            │
     │                                      │                            │
     │◄─── 201 Created ────────────────────────────────────────────────│
```

### 5.2 Cấu hình

**BizOne API** dùng client `bizone-api` (realm `bizone`) với scope token exchange sang realm `payment-hub`:

```
Client ID: bizone-api
Grant Type: client_credentials
Scope: payhub:transactions payhub:qr
Token Exchange: enabled (bizone → payment-hub)
```

> ⚠️ **Keycloak 26:** Token Exchange v1 (`KC_FEATURES=token-exchange`) đã deprecated. Standard Token Exchange v2 bật mặc định nhưng chỉ đổi token **trong cùng một realm**, không đổi sang realm `payment-hub`. P1.5 cần chọn lại cách M2M: (a) `bizone-api` lấy token trực tiếp bằng client credentials của một client trong realm `payment-hub`, hoặc (b) gộp client vào chung realm. Không phát triển thêm dựa trên token exchange v1.

**Env variables trên BizOne API server:**
```bash
KEYCLOAK_URL=https://keycloak.bizone.vn
KEYCLOAK_REALM=bizone
KEYCLOAK_CLIENT_ID=bizone-api
KEYCLOAK_CLIENT_SECRET=<secret từ Keycloak>
KEYCLOAK_PAYHUB_REALM=payment-hub
KEYCLOAK_PAYHUB_CLIENT_ID=payhub-api
```

**Lưu ý**: Token được cache trong memory (với TTL = `expires_in - 60s`) để tránh gọi Keycloak mỗi request.

---

## 6. Omni Channel OAuth (Shopee, Lazada, TikTok, Facebook)

### 6.1 Tổng quan

BizOne kết nối sàn TMĐT thông qua OAuth 2.0 của từng sàn.
Đây là **outbound OAuth** — BizOne là OAuth client, sàn là Authorization Server.

### 6.2 Per-platform OAuth Config

| Sàn | Grant Type | Scope | Callback URL |
|-----|-----------|-------|-------------|
| Shopee | Authorization Code | `product_listing`, `order_management`, `shop_information` | `/api/omni/callbacks/shopee` |
| Lazada | Authorization Code | `PRODUCT_OVERVIEW`, `FINANCE_OVERVIEW`, `ORDER_OVERVIEW` | `/api/omni/callbacks/lazada` |
| TikTok Shop | Authorization Code | `product.write`, `order.read`, `shop.read` | `/api/omni/callbacks/tiktok` |
| Facebook Shops | Authorization Code | `catalog_management`, `orders_management` | `/api/omni/callbacks/facebook` |

### 6.3 Flow kết nối sàn

```
Merchant (BizOne UI)           BizOne API              Shopee OAuth Server
     │                            │                           │
     │── 1. Click "Kết nối Shopee"►│                           │
     │                            │                           │
     │   2. Redirect Shopee ◄──── │                           │
     │   (với state=tenant_id)     │                           │
     │                            │                           │
     │───────────────────────────────► 3. Đăng nhập Shopee    │
     │                            │                           │
     │◄──────────────────── 4. code + state ─────────────────│
     │                            │                           │
     │── 5. GET /api/omni/callbacks/shopee?code=&state= ──────►│
     │                            │─── 6. Exchange code ──────►│
     │                            │◄─── access_token ─────────│
     │                            │                           │
     │                            │── 7. Lưu token (encrypted)
     │                            │   vào omni_connections
     │◄── 8. Kết nối thành công ───│
```

### 6.4 Lưu trữ token sàn TMĐT

```sql
-- Bảng lưu OAuth tokens của sàn TMĐT
CREATE TABLE omni_connections (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id   VARCHAR(50) NOT NULL,
    platform    ENUM('shopee', 'lazada', 'tiktok', 'facebook'),
    shop_id     VARCHAR(100),
    shop_name   VARCHAR(255),
    access_token  TEXT,               -- encrypted AES-256
    refresh_token TEXT,               -- encrypted AES-256
    expires_at    DATETIME,
    scope         TEXT,
    status        ENUM('active', 'expired', 'revoked'),
    created_at    DATETIME,
    updated_at    DATETIME
);
```

**Token refresh**: BullMQ job chạy mỗi giờ, refresh token sắp hết hạn (còn < 2 giờ).

---

## 7. Keycloak Deployment

### 7.1 Cấu hình Production

**Phiên bản:** Keycloak **26.8.1** · MariaDB **10.11** (Keycloak 26 yêu cầu MariaDB ≥ 10.4).

```yaml
# docker-compose.keycloak.yml (production, simplified)
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.8.1
    command: start
    environment:
      KC_DB: mariadb
      KC_DB_URL: jdbc:mariadb://mariadb:3306/keycloakdb
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KC_HOSTNAME: https://keycloak.bizone.vn   # hostname v2: full URL
      KC_HTTP_ENABLED: "true"                   # TLS terminates at nginx/LB
      KC_PROXY_HEADERS: xforwarded              # replaces KC_PROXY (removed in 26)
      KC_HEALTH_ENABLED: "true"                 # /health/* on management port 9000
      KC_METRICS_ENABLED: "true"                # /metrics on management port 9000
      KC_FEATURES: token-exchange               # v1, deprecated — see §5.2
      KC_BOOTSTRAP_ADMIN_USERNAME: admin        # replaces KEYCLOAK_ADMIN (deprecated in 26)
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    ports:
      - "8080:8080"     # public HTTP (behind proxy)
      # 9000 = management (health/metrics): keep internal, do not expose publicly
    volumes:
      - ./keycloak/themes:/opt/keycloak/themes  # BizOne custom theme
      - ./keycloak/realms:/opt/keycloak/data/import  # realm configs
```

**Yêu cầu tài nguyên:**
- CPU: 2 cores (min), 4 cores (recommended)
- RAM: 2GB (min), 4GB (recommended)
- DB: MariaDB 10.11, dedicated `keycloakdb`

**Lưu ý nâng cấp:** Keycloak tự migrate schema `keycloakdb` khi khởi động bản mới (đã chạy 23.0.7 → 26.8.1 ngày 2026-11-03: các realm migrate tuần tự 24 → 25 → 26.x, không mất dữ liệu). Luôn backup `keycloakdb` trước khi nâng cấp. Fine-Grained Admin Permissions v2 và Standard Token Exchange v2 bật mặc định trong 26.x.

### 7.2 Realm Import/Export

Cấu hình realm lưu trong version control:
```
keycloak/
  realms/
    bizone-realm.json         # realm bizone config
    payment-hub-realm.json    # realm payment-hub config
    partners-realm.json       # realm partners config
```

Đây là nguồn truth duy nhất — không cấu hình trực tiếp qua Admin Console mà không update file này.

### 7.3 High Availability

Production chạy 2+ Keycloak instance với:
- Shared MariaDB (hoặc Galera cluster)
- Infinispan distributed cache (built-in Keycloak clustering)
- Load balancer: sticky session `AUTH_SESSION_ID` cookie

---

## 8. BizOne API Token Validation

### 8.1 Middleware xác thực

```typescript
// middleware/auth.ts
import Keycloak from 'keycloak-connect';

const keycloak = new Keycloak({}, {
  realm: process.env.KEYCLOAK_REALM,
  'auth-server-url': process.env.KEYCLOAK_URL,
  resource: process.env.KEYCLOAK_CLIENT_ID,
  'bearer-only': true,
});

// Validate JWT (verify signature via JWKS, check expiry, audience)
export const requireAuth = keycloak.protect();

// Validate tenant claim
export const requireTenant = (req, res, next) => {
  const token = req.kauth.grant.access_token.content;
  const headerTenantId = req.headers['x-tenant-id'];

  if (token.tenant_id !== headerTenantId) {
    return res.status(403).json({
      success: false,
      error: { code: 'TENANT_MISMATCH', message: 'Token tenant không khớp với X-Tenant-ID header' }
    });
  }
  next();
};
```

### 8.2 JWKS Caching

Keycloak JWKS (`/certs` endpoint) được cache trên BizOne API:
- TTL: 24 giờ (public keys ít thay đổi)
- Force refresh khi gặp `kid` không tìm thấy trong cache
- Thư viện: `jwks-rsa` + `jsonwebtoken`

### 8.3 Token Introspection (tùy chọn)

Với các thao tác nhạy cảm (thanh toán lớn, xóa dữ liệu), gọi thêm introspection endpoint:

```
POST /realms/bizone/protocol/openid-connect/token/introspect
Authorization: Basic {base64(client_id:client_secret)}
Body: token={access_token}

Response: {"active": true, "tenant_id": "abc", ...}
```

**Lưu ý**: Introspection có latency (~10-20ms) — chỉ dùng khi cần, không dùng cho mọi request.

---

## 9. Security Checklist

### 9.1 Keycloak hardening

- [ ] Đổi admin password mặc định
- [ ] Tắt Registration tự do (admin-only user creation)
- [ ] Bật Brute Force Protection (15 lần thất bại = lock 5 phút)
- [ ] HTTPS only (KC_HOSTNAME_STRICT_HTTPS=true)
- [ ] Tắt `direct access grants` (resource owner password) trừ testing
- [ ] Bật Event Logging (login, logout, token issuance)
- [ ] Rotate realm keys hàng năm

### 9.2 BizOne API

- [ ] Luôn verify signature JWT với JWKS (không trust without verify)
- [ ] Check `exp`, `iss`, `aud` claims
- [ ] Validate `tenant_id` với `X-Tenant-ID` header
- [ ] Không log `access_token` hoặc `client_secret`
- [ ] Mã hóa `client_secret` trong env (không hardcode)

### 9.3 Third-party Apps

- [ ] Bắt buộc PKCE (S256) cho public clients
- [ ] Validate `state` parameter (CSRF protection)
- [ ] Whitelist redirect URIs chính xác (không wildcard)
- [ ] Consent screen bắt buộc với tất cả scopes
- [ ] Rate limit OAuth endpoints

---

## 10. Environment Variables

### BizOne API

```bash
# Keycloak connection
KEYCLOAK_URL=https://keycloak.bizone.vn
KEYCLOAK_REALM=bizone
KEYCLOAK_CLIENT_ID=bizone-api
KEYCLOAK_CLIENT_SECRET=<from-keycloak-admin>

# PayHub service account
PAYHUB_KEYCLOAK_REALM=payment-hub
PAYHUB_KEYCLOAK_CLIENT_ID=payhub-api
PAYHUB_KEYCLOAK_CLIENT_SECRET=<from-keycloak-admin>

# Frontend OAuth config (public - safe to expose)
NEXT_PUBLIC_KEYCLOAK_URL=https://keycloak.bizone.vn
NEXT_PUBLIC_KEYCLOAK_REALM=bizone
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=bizone-frontend
```

### PayHub API

```bash
KEYCLOAK_URL=https://keycloak.bizone.vn
KEYCLOAK_REALM=payment-hub
KEYCLOAK_CLIENT_ID=payhub-api
KEYCLOAK_CLIENT_SECRET=<from-keycloak-admin>
# JWKS cache TTL
KEYCLOAK_JWKS_CACHE_TTL=86400
```
