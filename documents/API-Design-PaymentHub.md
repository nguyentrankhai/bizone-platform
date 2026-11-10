# API Design - Payment Hub

## Hệ thống Trung gian Thanh toán Tập trung

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne Payment Hub - Payment Gateway Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 12/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Tổng quan

### 1.1. Mục tiêu thiết kế API

- **RESTful**: API thanh toán theo chuẩn RESTful, JSON encoding
- **Type-safe**: Sử dụng tRPC cho admin dashboard (nội bộ), REST cho tích hợp bên thứ ba
- **Bảo mật cao**: HMAC-SHA256 signature cho API public, JWT cho admin
- **Real-time**: WebSocket cho dashboard real-time, thông báo giao dịch
- **Idempotent**: Mutation endpoints hỗ trợ idempotency key chống trùng lặp
- **Async**: Xử lý bất đồng bộ cho webhook, đối soát, báo cáo

### 1.2. Stack công nghệ

| Thành phần | Công nghệ |
|-----------|-----------|
| **Framework** | Next.js 14+ (App Router) |
| **API Layer** | Next.js API Routes (REST) + tRPC (admin dashboard) |
| **Authentication** | HMAC-SHA256 (API Key) cho merchant API; JWT cho admin |
| **Database** | MariaDB 10.11+ |
| **Cache** | Redis (session, rate limiting, idempotency keys) |
| **Queue/Job** | BullMQ / Inngest (webhook, reconcilation, async tasks) |
| **Real-time** | Socket.IO / WebSocket API (dashboard) |
| **File Storage** | MinIO / AWS S3 (QR images, reports) |

### 1.3. Base URL

```env
# Development
PAYMENT_API_BASE_URL=http://localhost:3001/api/v1
ADMIN_API_BASE_URL=http://localhost:3001/api/admin

# Staging
PAYMENT_API_BASE_URL=https://sandbox-payment.bizone.vn/api/v1
ADMIN_API_BASE_URL=https://sandbox-payment.bizone.vn/api/admin

# Production
PAYMENT_API_BASE_URL=https://payment.bizone.vn/api/v1
ADMIN_API_BASE_URL=https://payment.bizone.vn/api/admin
```

### 1.4. API Versioning

- Versioning qua URL path: `/api/v1/`
- Header `Accept-Version: 1.0` cho backward compatibility
- Version cũ được support tối thiểu 6 tháng
- Breaking changes thông báo trước 30 ngày

---

## 2. Authentication & Security

### 2.1. Merchant API Authentication (HMAC-SHA256)

Tất cả request đến Payment Hub Merchant API phải có chữ ký HMAC-SHA256.

**Headers:**

| Header | Mô tả | Bắt buộc |
|--------|-------|----------|
| `X-Api-Key` | API Key của merchant | Có |
| `X-Signature` | hex(HMAC-SHA256) — xem bên dưới | Có |
| `X-Timestamp` | Unix timestamp (**giây**), lệch tối đa ±300s | Có |
| `Idempotency-Key` | UUID chống trùng lặp | Không (khuyến nghị) |

**Cách tạo signature** (khớp `OpenAPI-PaymentHub.yaml` → `MerchantHMAC`; cài đặt: `source/payment-hub/lib/hmac.ts`):

```
X-Signature = hex(
  HMAC-SHA256(
    api_secret,
    HTTP_METHOD + "\n" +          // chữ in hoa: POST, GET…
    URI_PATH + "\n" +             // path + query đúng như gửi: /api/v1/transactions?page=2
    X-Timestamp + "\n" +          // Unix giây
    hex(SHA256(Body))             // body thô; request không có body → SHA256("")
  )
)
```

Ví dụ:
```
POST /api/v1/transactions
X-Api-Key: pk_3f9c…
X-Timestamp: 1718200000
X-Signature: <hex(HMAC-SHA256(secret, "POST\n/api/v1/transactions\n1718200000\n" + hex(SHA256("{\"amount\":150000}"))))>
```

Ghi chú:
- Chữ ký gắn method + path nên không dùng lại được cho endpoint khác.
- `api_secret` chỉ hiển thị một lần khi cấp key; Payment Hub lưu dạng mã hoá AES-256-GCM. Cấp key (dev): `npm run apikey:create -- <MERCHANT_CODE>`.

### 2.2. Admin Authentication (JWT)

| Endpoint | Mô tả |
|----------|-------|
| `POST /api/admin/auth/login` | Đăng nhập |
| `POST /api/admin/auth/refresh` | Refresh token |
| `POST /api/admin/auth/logout` | Đăng xuất |
| `POST /api/admin/auth/change-password` | Đổi mật khẩu |
| `POST /api/admin/auth/forgot-password` | Quên mật khẩu |
| `POST /api/admin/auth/reset-password` | Đặt lại mật khẩu |

```
Header: Authorization: Bearer <access_token>
```

- **Access Token**: 15 phút, chứa user_id, role
- **Refresh Token**: 7 ngày

### 2.3. Roles & Permissions (Admin)

| Role | Code | Mô tả |
|------|------|-------|
| System Admin | `Admin` | Toàn quyền trên Payment Hub |
| Owner | `Owner` | Xem báo cáo, dashboard |
| Developer | `Developer` | Quản lý webhook, xem tích hợp |
| Operations Staff | `Operations` | Tra cứu GD, hoàn tiền, tra soát, đối soát |
| Partner Manager | `PartnerManager` | Quản lý đối tác, Connector |

### 2.4. IP Whitelist (Tùy chọn)

Merchant có thể cấu hình IP whitelist trong merchant settings. Request từ IP ngoài danh sách sẽ bị từ chối.

### 2.5. Mã hóa dữ liệu nhạy cảm

- API Key, Secret Key lưu trong database được mã hóa AES-256
- TLS 1.2+ bắt buộc cho mọi kết nối

---

## 3. Response Format

### 3.1. Response chuẩn

#### Thành công
```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Lỗi
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": [
      {
        "field": "amount",
        "message": "Số tiền phải lớn hơn 0"
      }
    ]
  }
}
```

### 3.2. Error Codes

| Code | HTTP Status | Mô tả |
|------|-------------|-------|
| UNAUTHORIZED | 401 | API Key hoặc signature không hợp lệ |
| FORBIDDEN | 403 | Không có quyền |
| NOT_FOUND | 404 | Resource không tồn tại |
| VALIDATION_ERROR | 422 | Dữ liệu không hợp lệ |
| CONFLICT | 409 | Xung đột (trùng merchant_txn_id) |
| RATE_LIMITED | 429 | Vượt quá giới hạn request |
| INSUFFICIENT_BALANCE | 402 | Không đủ số dư (refund) |
| PARTNER_ERROR | 502 | Lỗi từ đối tác thanh toán |
| REFUND_NOT_SUPPORTED | 400 | Đối tác không hỗ trợ refund |
| TRANSACTION_EXPIRED | 400 | Giao dịch đã hết hạn |
| INTERNAL_ERROR | 500 | Lỗi máy chủ |

### 3.3. Rate Limiting Headers

```
Header: X-RateLimit-Limit: 100
Header: X-RateLimit-Remaining: 95
Header: X-RateLimit-Reset: 1718200000
```

| Loại | Limit | Window |
|------|-------|--------|
| Merchant API | 100 requests | 1 phút |
| QR Generate | 60 requests | 1 phút |
| Refund API | 30 requests | 1 phút |
| Webhook Test | 10 requests | 1 phút |
| Admin API | 200 requests | 1 phút |

### 3.4. Common Query Parameters (Admin endpoints)

| Parameter | Type | Mô tả |
|-----------|------|-------|
| `page` | number | Số trang (default: 1) |
| `pageSize` | number | Số item/trang (default: 20, max: 100) |
| `search` | string | Từ khóa tìm kiếm |
| `sortBy` | string | Trường sắp xếp (created_at, amount, status) |
| `sortOrder` | 'asc' \| 'desc' | Chiều sắp xếp (default: desc) |
| `status` | string | Lọc theo trạng thái |
| `fromDate` | ISO date | Lọc từ ngày |
| `toDate` | ISO date | Lọc đến ngày |
| `partner` | string | Lọc theo đối tác |
| `amountMin` | number | Lọc số tiền tối thiểu |
| `amountMax` | number | Lọc số tiền tối đa |

---

## 4. Idempotency

Mutation endpoints hỗ trợ idempotency key để chống trùng lặp giao dịch.

```
Header: Idempotency-Key: <UUID v4>
```

- Key lưu trong Redis với TTL 24 giờ (hoặc trong bảng `idempotency_keys`)
- Request trùng key trong TTL trả về response cũ
- Đảm bảo không tạo trùng giao dịch
- Request cùng key gửi đồng thời khi request đầu chưa xong → `409 CONFLICT` (retry sau); cùng key nhưng body khác → `409 CONFLICT`; response lặp lại có header `Idempotent-Replayed: true`
- Header cũ `X-Idempotency-Key` vẫn được chấp nhận (tương thích ngược)
- Các endpoint hỗ trợ: tạo giao dịch, refund, sinh QR (sinh QR vốn idempotent theo tài nguyên: cùng giao dịch + loại + kích thước luôn trả QR hiện hành)

---

## 5. Merchant API Endpoints (Public)

### 5.1. Transactions

#### `POST /api/v1/transactions` - Tạo giao dịch thanh toán

**Request:**
```json
{
  "merchant_txn_id": "ORDER-123456",
  "amount": 1500000,
  "currency": "VND",
  "description": "Thanh toán đơn hàng #123",
  "payment_method": null,
  "return_url": "https://bizone.vn/order/123",
  "webhook_url": "https://bizone.vn/webhooks/payment",
  "customer": {
    "name": "Nguyễn Văn A",
    "email": "a@example.com",
    "phone": "0901234567"
  },
  "metadata": {
    "source": "pos",
    "branch_id": 1
  }
}
```

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `merchant_txn_id` | string | Có | Mã giao dịch của merchant (unique) |
| `amount` | number | Có | Số tiền (VND, nguyên dương) |
| `currency` | string | Không | Mặc định "VND" |
| `description` | string | Không | Mô tả thanh toán |
| `payment_method` | string | Không | `vnpay_qr`, `vnpay_atm`, `vnpay_card`, `vnpay`, `vietqr`, `momo_qr`, `zalopay_qr` (`services/routing/routeMap.ts`). null = khách chọn trên trang `payment_url` (chỉ liệt kê phương thức đang khả dụng). Route Engine chọn đối tác theo ưu tiên của merchant, fallback khi đối tác lỗi (P3.8) |
| `qr_size` | number | Không | Kích thước QR khi `payment_method = vietqr` hoặc `momo_qr`: 200 / 300 (mặc định) / 500 |
| `return_url` | string | Không | URL redirect sau khi thanh toán |
| `webhook_url` | string | Không | URL nhận webhook kết quả (ghi đè config) |
| `customer` | object | Không | Thông tin khách hàng |
| `metadata` | object | Không | Dữ liệu bổ sung |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "TXN-20260612-A1B2C3",
    "merchant_txn_id": "ORDER-123456",
    "amount": 1500000,
    "currency": "VND",
    "status": "Created",
    "payment_url": "https://payment.bizone.vn/checkout/TXN-20260612-A1B2C3",
    "qr_code": {
      "type": "VietQR",
      "image_base64": "data:image/png;base64,...",
      "image_url": "https://storage.bizone.vn/qr/TXN-20260612-A1B2C3.png",
      "raw_data": "000201010212...",
      "expires_at": "2026-06-12T15:00:00+07:00"
    },
    "expired_at": "2026-06-12T15:00:00+07:00"
  }
}
```

| Field | Type | Mô tả |
|-------|------|-------|
| `transaction_id` | string | Mã giao dịch nội bộ Payment Hub |
| `payment_url` | string | URL trang thanh toán (nếu thanh toán online) |
| `qr_code` | object | QR Code khi `payment_method = vietqr` (`type: VietQR`, có `bank`, `transfer_note`; `payment_url` là trang QR của Hub) hoặc `momo_qr` (`type: PartnerQR`, `provider: MoMo`, `raw_data` = `qrCodeUrl` của MoMo — app MoMo quét, `image_base64` do Hub vẽ, `deeplink` mở app MoMo, `image_url`/`bank` = `null`; `payment_url` là trang thanh toán của MoMo) hoặc `zalopay_qr` (`type: PartnerQR`, `provider: ZaloPay`, `raw_data` = `qr_code` của ZaloPay, `deeplink` = `null`; `payment_url` = `order_url` của ZaloPay). Phương thức khác: `null` |
| `partner` | string | Loại đối tác Route Engine đã chọn (`VNPay`, `VietQR`…) |
| `fallback_used` | boolean | Có khi đối tác ưu tiên lỗi và GD được chuyển sang đối tác kế tiếp |
| `payment_error` | object | Có khi mọi đối tác của phương thức lỗi lúc tạo — GD vẫn `Created`, khách chọn phương thức khác trên `payment_url` |
| `expired_at` | datetime | Thời gian hết hạn giao dịch |

> `amount` ngoài hạn mức của phương thức (`momo_qr`: 1.000 – 50.000.000 ₫) → **400 `VALIDATION_ERROR`** (`details.amount`), không tạo GD. `zalopay_qr` cần `expiry_minutes` ≥ 5 (ZaloPay giữ đơn tối thiểu 300 s) → nhỏ hơn: 400 (`details.expiry_minutes`).
>
> Phương thức không còn đối tác khả dụng (đối tác Inactive/Error, connector tắt, circuit mở) → **503 `SERVICE_UNAVAILABLE`**, không tạo GD; `error.details` có `skipped` (lý do từng đối tác) và `available_methods`.

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "merchant_txn_id đã tồn tại",
    "details": [
      {
        "field": "merchant_txn_id",
        "message": "ORDER-123456 đã được sử dụng cho giao dịch TXN-20260612-ABCDEF"
      }
    ]
  }
}
```

---

#### `GET /api/v1/transactions/{transaction_id}` - Tra cứu giao dịch theo ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "TXN-20260612-A1B2C3",
    "merchant_txn_id": "ORDER-123456",
    "amount": 1500000,
    "refunded_amount": 0,
    "currency": "VND",
    "description": "Thanh toán đơn hàng #123",
    "status": "Success",
    "payment_method": "VietQR",
    "partner": "VNPay",
    "partner_txn_id": "VNPAY1234567890",
    "customer": {
      "name": "Nguyễn Văn A",
      "email": "a@example.com",
      "phone": "0901234567"
    },
    "paid_at": "2026-06-12T14:30:22+07:00",
    "expired_at": "2026-06-12T15:00:00+07:00",
    "created_at": "2026-06-12T14:29:00+07:00"
  }
}
```

---

#### `GET /api/v1/transactions/merchant/{merchant_txn_id}` - Tra cứu theo mã merchant

Giống response trên, tra cứu dựa trên `merchant_txn_id + merchant_id` (từ API Key).

---

#### `POST /api/v1/transactions/{transaction_id}/refund` - Yêu cầu hoàn tiền

**Request:**
```json
{
  "amount": 500000,
  "reason": "Khách hàng yêu cầu hoàn trả"
}
```

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `amount` | number | Không | null/omitted = toàn phần; số tiền cụ thể = một phần |
| `reason` | string | Có | Lý do hoàn tiền |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "refund_code": "REF-20260612-XXXXXX",
    "transaction_id": "TXN-20260612-A1B2C3",
    "amount": 500000,
    "status": "Completed",
    "partner_refund_id": "VNPAY_REF_123456",
    "processed_at": "2026-06-12T15:30:00+07:00"
  }
}
```

---

### 5.2. QR Codes

#### `POST /api/v1/qr/generate` - Sinh QR thanh toán

**Request:**
```json
{
  "transaction_id": "TXN-20260612-A1B2C3",
  "type": "VietQR",
  "size": 300
}
```

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `transaction_id` | string | Có | Mã giao dịch đã tạo |
| `type` | string | Không | "VietQR" (default), "NapasQR", "PartnerQR" |
| `size` | number | Không | Kích thước: 200, 300 (default), 500 |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "TXN-20260612-A1B2C3",
    "type": "VietQR",
    "image_base64": "data:image/png;base64,...",
    "image_url": "https://storage.bizone.vn/qr/TXN-20260612-A1B2C3.png",
    "raw_data": "000201010212...",
    "size": 300,
    "expires_at": "2026-06-12T15:00:00+07:00"
  }
}
```

---

### 5.3. Partners

#### `GET /api/v1/partners` - Danh sách đối tác hỗ trợ

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "code": "VNPay",
      "name": "VNPay",
      "methods": ["qr", "atm", "credit_card"],
      "active": true
    },
    {
      "code": "MoMo",
      "name": "MoMo Wallet",
      "methods": ["qr", "wallet"],
      "active": true
    }
  ]
}
```

---

### 5.4. Webhook Test

#### `POST /api/v1/webhook-test` - Gửi webhook test

**Request:**
```json
{
  "url": "https://bizone.vn/webhooks/payment",
  "event": "payment.success"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status_code": 200,
    "duration_ms": 350,
    "message": "Webhook test sent successfully"
  }
}
```

---

## 6. Admin API Endpoints (Internal)

### 6.1. Dashboard

#### `GET /api/admin/dashboard` - Dashboard tổng quan

**Query Parameters:**
- `period`: "today" | "7days" | "30days" (default: today)
- `partner`: filter by partner (optional)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_transactions": 245,
      "total_amount": 150000000,
      "success_count": 230,
      "failed_count": 10,
      "pending_count": 5,
      "success_rate": 93.88
    },
    "chart_7days": [
      {
        "date": "2026-06-05",
        "count": 180,
        "amount": 110000000,
        "success_count": 170,
        "failed_count": 8
      }
    ],
    "payment_methods": [
      { "method": "VNPay", "count": 120, "amount": 75000000, "percentage": 48.98 },
      { "method": "MoMo", "count": 80, "amount": 50000000, "percentage": 32.65 }
    ],
    "recent_transactions": [
      {
        "transaction_id": "TXN-20260612-A1B2C3",
        "amount": 1500000,
        "status": "Success",
        "partner": "VNPay",
        "created_at": "2026-06-12T14:29:00+07:00"
      }
    ],
    "alerts": [
      { "type": "error", "message": "Webhook thất bại: 5 lần liên tiếp", "count": 5 }
    ]
  }
}
```

---

### 6.2. Transactions Management

#### `GET /api/admin/transactions` - Danh sách giao dịch

**Query Parameters:** page, pageSize, status, partner, merchantId, fromDate, toDate, amountMin, amountMax, search (txn_code hoặc merchant_txn_id), sortBy, sortOrder

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "txn_code": "TXN-20260612-A1B2C3",
      "merchant_txn_id": "ORDER-123456",
      "amount": 1500000,
      "currency": "VND",
      "status": "Success",
      "payment_method": "VietQR",
      "partner": "VNPay",
      "customer_name": "Nguyễn Văn A",
      "created_at": "2026-06-12T14:29:00+07:00"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1250,
    "totalPages": 63
  }
}
```

#### `GET /api/admin/transactions/{id}` - Chi tiết giao dịch

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": 1,
      "txn_code": "TXN-20260612-A1B2C3",
      "merchant_txn_id": "ORDER-123456",
      "amount": 1500000,
      "refunded_amount": 500000,
      "currency": "VND",
      "description": "Thanh toán đơn hàng #123",
      "status": "PartiallyRefunded",
      "payment_method": "VietQR",
      "partner": "VNPay",
      "partner_txn_id": "VNPAY1234567890",
      "customer": {
        "name": "Nguyễn Văn A",
        "email": "a@example.com",
        "phone": "0901234567"
      },
      "merchant": {
        "id": 1,
        "name": "BizOne Default"
      },
      "meta": {
        "source": "pos",
        "branch_id": 1
      },
      "paid_at": "2026-06-12T14:30:22+07:00",
      "expired_at": "2026-06-12T15:00:00+07:00",
      "created_at": "2026-06-12T14:29:00+07:00",
      "updated_at": "2026-06-12T15:30:00+07:00"
    },
    "logs": [
      {
        "event": "Transaction Created",
        "from_status": null,
        "to_status": "Created",
        "description": "Transaction created by merchant BI_ZONE",
        "created_at": "2026-06-12T14:29:00+07:00"
      },
      {
        "event": "Payment Success",
        "from_status": "Pending",
        "to_status": "Success",
        "description": "VNPay confirmed payment",
        "raw_data": { "partner_response": {} },
        "created_at": "2026-06-12T14:30:22+07:00"
      }
    ],
    "raw_data": [
      {
        "direction": "Request",
        "source": "PaymentHub",
        "endpoint": "https://sandbox.vnpay.vn/payment",
        "body": {},
        "http_status": 200,
        "created_at": "2026-06-12T14:29:05+07:00"
      }
    ],
    "refunds": [
      {
        "refund_code": "REF-20260612-XXXXXX",
        "amount": 500000,
        "status": "Completed",
        "reason": "Khách hàng yêu cầu hoàn trả",
        "created_at": "2026-06-12T15:30:00+07:00"
      }
    ]
  }
}
```

#### `POST /api/admin/transactions/{id}/refund` - Hoàn tiền (admin UI)

**Request:**
```json
{
  "amount": 500000,
  "reason": "Khách hàng yêu cầu hoàn trả"
}
```

#### `POST /api/admin/transactions/export` - Xuất danh sách giao dịch

**Request:**
```json
{
  "format": "xlsx",
  "filters": {
    "fromDate": "2026-06-01",
    "toDate": "2026-06-12",
    "status": "Success"
  },
  "columns": ["txn_code", "amount", "status", "partner", "created_at"]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "task_id": "export-txn-abc123",
    "status": "Processing"
  }
}
```

---

### 6.2b. Route Engine (P3.8)

Định tuyến `payment_method` → đối tác (`partner_configs`). Thứ tự: danh sách ưu tiên của merchant (`merchant_routes`), sau đó các đối tác Active còn lại theo id (fallback). Bỏ qua đối tác `Inactive`/`Error`, connector tắt (`connectors.is_active = 0`), đối tác bị merchant tắt và đối tác đang mở circuit (≥ 5 lỗi liên tiếp trong 60 s → bỏ qua 30 s). Đối tác lỗi khi tạo thanh toán → thử đối tác kế tiếp.

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| GET | `/api/internal/routes` | admin, viewer | Định tuyến mặc định (không có ưu tiên merchant) + trạng thái circuit từng đối tác |
| GET | `/api/internal/routes/{merchantId}` | admin, viewer | Ưu tiên đã cấu hình, route hiệu lực (`route`), đối tác bị bỏ qua + lý do (`skipped`) cho 7 phương thức |
| PUT | `/api/internal/routes/{merchantId}` | admin | `{ "routes": [{ "payment_method": "vnpay_qr", "partners": [{ "partner_config_id": 3 }, { "partner_config_id": 1, "enabled": false }] }] }` — thứ tự mảng = ưu tiên; `partners: []` xoá cấu hình của phương thức đó |
| DELETE | `/api/internal/routes/circuits/{partnerConfigId}` | admin (không gắn merchant) | Đóng circuit, xoá bộ đếm lỗi |

Lý do bỏ qua (`skipped[].reason`): `inactive`, `error_status`, `connector_disabled`, `connector_not_implemented`, `disabled_for_merchant`, `circuit_open`.

### 6.3. Partners Management

#### `GET /api/admin/partners` - Danh sách đối tác

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "connector_type": "VNPay",
      "name": "VNPay Gateway",
      "status": "Active",
      "environment": "Production",
      "last_tested_at": "2026-06-12T10:00:00+07:00",
      "test_result": { "success": true },
      "created_at": "2026-06-01T00:00:00+07:00"
    }
  ]
}
```

#### `POST /api/admin/partners` - Thêm đối tác

**Request:**
```json
{
  "connector_type": "VNPay",
  "name": "VNPay Gateway",
  "api_key": "encrypted_key_here",
  "secret_key": "encrypted_secret_here",
  "merchant_code": "BIZONE_MERCHANT",
  "endpoint_sandbox": "https://sandbox.vnpay.vn/payment",
  "endpoint_production": "https://payment.vnpay.vn/payment",
  "callback_url": "https://payment.bizone.vn/callback/vnpay",
  "webhook_url": "https://payment.bizone.vn/webhook/vnpay",
  "timeout": 30000,
  "retry_policy": {
    "max_retries": 3,
    "backoff_ms": 1000
  },
  "environment": "Sandbox"
}
```

#### `PUT /api/admin/partners/{id}` - Cập nhật cấu hình đối tác

#### `POST /api/admin/partners/{id}/test` - Test kết nối

**Response (200):**
```json
{
  "success": true,
  "data": {
    "test_result": {
      "success": true,
      "message": "Kết nối thành công đến VNPay Sandbox",
      "response_time_ms": 450
    },
    "last_tested_at": "2026-06-12T10:00:00+07:00"
  }
}
```

#### `PUT /api/admin/partners/{id}/status` - Kích hoạt/Vô hiệu hóa

**Request:**
```json
{
  "status": "Active"
}
```

#### `GET /api/admin/partners/{id}/logs` - Lịch sử thay đổi cấu hình

---

### 6.4. Connectors Management

#### `GET /api/admin/connectors` - Danh sách Connector

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "VNPay Connector",
      "code": "VNPay",
      "version": "1.0.0",
      "status": "Installed",
      "is_active": true,
      "created_at": "2026-06-01T00:00:00+07:00"
    }
  ]
}
```

#### `POST /api/admin/connectors` - Upload Connector plugin

```
Content-Type: multipart/form-data

file: <plugin.zip>
config: { "name": "NewPartner", "version": "1.0.0" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "name": "NewPartner Connector",
    "code": "NewPartner",
    "version": "1.0.0",
    "status": "Installed",
    "is_active": false
  }
}
```

#### `PUT /api/admin/connectors/{id}/toggle` - Kích hoạt/Vô hiệu hóa Connector

**Request:**
```json
{
  "is_active": true
}
```

#### `DELETE /api/admin/connectors/{id}` - Gỡ Connector

---

### 6.5. Webhook Management

#### `GET /api/admin/webhooks` - Danh sách webhook endpoints

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "merchant_id": 1,
      "url": "https://bizone.vn/webhooks/payment",
      "events": ["payment.success", "payment.failed", "refund.completed"],
      "status": "Active",
      "retry_count": 5,
      "created_at": "2026-06-01T00:00:00+07:00"
    }
  ]
}
```

#### `POST /api/admin/webhooks` - Thêm webhook endpoint

**Request:**
```json
{
  "merchant_id": 1,
  "url": "https://bizone.vn/webhooks/payment",
  "secret": "whsec_abc123",
  "events": ["payment.success", "payment.failed", "refund.completed"],
  "retry_count": 5,
  "timeout_ms": 30000
}
```

#### `PUT /api/admin/webhooks/{id}` - Cập nhật webhook

#### `DELETE /api/admin/webhooks/{id}` - Xóa webhook

#### `POST /api/admin/webhooks/{id}/test` - Gửi webhook test (ping)

#### `POST /api/admin/webhooks/{id}/toggle` - Kích hoạt/Vô hiệu hóa

---

### 6.6. Webhook History

#### `GET /api/admin/webhook-logs` - Lịch sử webhook

**Query Parameters:** webhookConfigId, transactionId, event, status (Success/Failed), fromDate, toDate, page, pageSize

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "event": "payment.success",
      "request_url": "https://bizone.vn/webhooks/payment",
      "response_status": 200,
      "status": "Success",
      "attempt": 1,
      "duration_ms": 350,
      "created_at": "2026-06-12T14:30:25+07:00"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 450,
    "totalPages": 23
  }
}
```

#### `GET /api/admin/webhook-logs/{id}` - Chi tiết webhook log

#### `POST /api/admin/webhook-logs/{id}/replay` - Gửi lại webhook

---

### 6.7. Reconciliation Management

#### `GET /api/admin/reconciliation` - Danh sách đợt đối soát

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "run_date": "2026-06-12",
      "partner": "VNPay",
      "status": "Completed",
      "total_paymenthub": 2340,
      "total_partner": 2340,
      "total_amount_paymenthub": 1500000000,
      "total_amount_partner": 1500000000,
      "matched_count": 2335,
      "unmatched_paymenthub": 3,
      "unmatched_partner": 2,
      "amount_mismatch_count": 0,
      "total_discrepancy": 0,
      "completed_at": "2026-06-12T00:15:00+07:00"
    }
  ]
}
```

#### `POST /api/admin/reconciliation` - Chạy đối soát thủ công

**Request:**
```json
{
  "partner_config_id": 1,
  "run_date": "2026-06-12"
}
```

#### `GET /api/admin/reconciliation/{id}` - Chi tiết đợt đối soát

#### `GET /api/admin/reconciliation/{id}/details` - Chi tiết các giao dịch lệch

**Query Parameters:** matchStatus (Matched, Unmatched_PaymentHub, Unmatched_Partner, Amount_Mismatch), status (Open, Resolved), page, pageSize

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "transaction_id": 1001,
      "txn_code": "TXN-20260612-ABCDEF",
      "partner_txn_id": null,
      "match_status": "Unmatched_PaymentHub",
      "paymenthub_amount": 1500000,
      "partner_amount": null,
      "discrepancy_amount": 1500000,
      "status": "Open"
    }
  ]
}
```

#### `PUT /api/admin/reconciliation/{runId}/details/{detailId}` - Cập nhật trạng thái xử lý

**Request:**
```json
{
  "status": "Resolved",
  "resolution": "Giao dịch hợp lệ, đối tác chưa cập nhật kịp"
}
```

#### `POST /api/admin/reconciliation/export` - Xuất báo cáo đối soát

---

### 6.8. Disputes (Tra soát)

#### `GET /api/admin/disputes` - Danh sách yêu cầu tra soát

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "dispute_code": "DSP-20260612-XXXXXX",
      "transaction_id": 1001,
      "txn_code": "TXN-20260612-A1B2C3",
      "reason": "Khách hàng khiếu nại chưa nhận được hàng",
      "status": "Pending",
      "created_by": "Nguyễn Văn A",
      "created_at": "2026-06-12T16:00:00+07:00"
    }
  ]
}
```

#### `POST /api/admin/disputes` - Tạo yêu cầu tra soát

**Request:**
```json
{
  "transaction_id": 1001,
  "reason": "Khách hàng khiếu nại chưa nhận được hàng",
  "description": "Khách hàng gọi điện thoại báo chưa nhận được hàng mặc dù đã thanh toán",
  "attachments": [
    {
      "file_name": "bien-ban.png",
      "file_path": "/uploads/disputes/dsp-001.png",
      "file_type": "image/png"
    }
  ]
}
```

#### `PUT /api/admin/disputes/{id}` - Cập nhật trạng thái

**Request:**
```json
{
  "status": "Resolved",
  "resolution": "Đã kiểm tra, giao dịch hợp lệ. Đã liên hệ khách hàng."
}
```

#### `GET /api/admin/disputes/{id}` - Chi tiết yêu cầu tra soát

---

### 6.9. Reports

#### `GET /api/admin/reports/transactions` - Báo cáo giao dịch

**Query Parameters:** fromDate, toDate, partner, paymentMethod, merchantId, status, groupBy (day|week|month)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_transactions": 12500,
      "total_amount": 7500000000,
      "total_fees": 75000000,
      "success_count": 12000,
      "failed_count": 500,
      "success_rate": 96.0
    },
    "chart": [
      {
        "date": "2026-06-01",
        "count": 400,
        "amount": 240000000,
        "success_count": 385,
        "failed_count": 15
      }
    ]
  }
}
```

#### `GET /api/admin/reports/revenue` - Báo cáo doanh thu

**Query Parameters:** fromDate, toDate, groupBy (partner|paymentMethod)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "by_partner": [
      { "partner": "VNPay", "amount": 4500000000, "count": 7200, "percentage": 60 },
      { "partner": "MoMo", "amount": 2500000000, "count": 3800, "percentage": 33.33 }
    ],
    "by_payment_method": [
      { "method": "VietQR", "amount": 3500000000, "count": 5500, "percentage": 46.67 },
      { "method": "MoMo QR", "amount": 2500000000, "count": 3800, "percentage": 33.33 }
    ],
    "growth": {
      "current_period": 7500000000,
      "previous_period": 6800000000,
      "growth_percentage": 10.29
    }
  }
}
```

#### `GET /api/admin/reports/reconciliation` - Báo cáo đối soát

**Query Parameters:** fromDate, toDate, partner

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_runs": 30,
      "total_matched": 29000,
      "total_unmatched": 45,
      "total_discrepancy": 15000000
    },
    "daily": [
      {
        "date": "2026-06-12",
        "matched": 2335,
        "unmatched": 5,
        "discrepancy": 500000
      }
    ]
  }
}
```

#### `POST /api/admin/reports/export` - Xuất báo cáo (PDF/Excel)

**Request:**
```json
{
  "type": "transactions",
  "format": "xlsx",
  "filters": {
    "fromDate": "2026-06-01",
    "toDate": "2026-06-12"
  }
}
```

---

### 6.10. Audit Logs

#### `GET /api/admin/audit-logs` - Danh sách audit log

**Query Parameters:** userId, action, entityType, entityId, fromDate, toDate, page, pageSize

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "action": "UPDATE",
      "entity_type": "PartnerConfig",
      "entity_id": "1",
      "description": "Cập nhật cấu hình VNPay: thay đổi endpoint_production",
      "ip_address": "192.168.1.1",
      "created_at": "2026-06-12T10:00:00+07:00"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1500,
    "totalPages": 75
  }
}
```

#### `GET /api/admin/audit-logs/{id}` - Chi tiết audit log (old_data, new_data)

---

### 6.11. Notifications

#### `GET /api/admin/notifications` - Danh sách thông báo

**Query Parameters:** isRead, type, fromDate, toDate, page, pageSize

#### `PUT /api/admin/notifications/{id}/read` - Đánh dấu đã đọc

#### `PUT /api/admin/notifications/read-all` - Đánh dấu tất cả đã đọc

#### `GET /api/admin/notifications/unread-count` - Số thông báo chưa đọc

---

### 6.12. Merchants Management

#### `GET /api/admin/merchants` - Danh sách merchant

#### `POST /api/admin/merchants` - Thêm merchant

**Request:**
```json
{
  "name": "BizOne Default",
  "code": "BIZONE",
  "contact_name": "BizOne Admin",
  "contact_email": "admin@bizone.local",
  "contact_phone": "0900000000",
  "monthly_limit": 1000000000,
  "ip_whitelist": ["192.168.1.0/24"]
}
```

#### `PUT /api/admin/merchants/{id}` - Cập nhật merchant

#### `POST /api/admin/merchants/{id}/api-keys` - Tạo API Key mới

**Response (201):**
```json
{
  "success": true,
  "data": {
    "api_key": "mer_abc123def456",
    "api_secret": "sk_live_xxxxx",
    "name": "Production Key",
    "note": "Lưu secret key này, nó sẽ không được hiển thị lại"
  }
}
```

#### `GET /api/admin/merchants/{id}/api-keys` - Danh sách API Key

#### `POST /api/admin/merchants/{id}/api-keys/{keyId}/revoke` - Thu hồi API Key

---

### 6.13. Users Management

#### `GET /api/admin/users` - Danh sách user

#### `POST /api/admin/users` - Thêm user

**Request:**
```json
{
  "username": "operator1",
  "email": "operator1@paymenthub.local",
  "password": "temporary_password",
  "full_name": "Nguyễn Văn A",
  "role": "Operations"
}
```

#### `PUT /api/admin/users/{id}` - Cập nhật user

#### `PUT /api/admin/users/{id}/deactivate` - Vô hiệu hóa user

---

## 7. Webhook Events (Outgoing - Payment Hub → Merchant)

### 7.1. Events

| Event | Mô tả | Gửi khi |
|-------|-------|---------|
| `payment.success` | Thanh toán thành công | Đối tác xác nhận GD thành công |
| `payment.failed` | Thanh toán thất bại | Đối tác báo GD thất bại |
| `payment.expired` | Giao dịch hết hạn | GD hết hạn chờ thanh toán |
| `refund.completed` | Hoàn tiền hoàn tất | Đối tác xác nhận hoàn tiền |

### 7.2. Payload mẫu

**payment.success:**
```json
{
  "event": "payment.success",
  "transaction_id": "TXN-20260612-A1B2C3",
  "merchant_txn_id": "ORDER-123456",
  "amount": 1500000,
  "currency": "VND",
  "partner": "VNPay",
  "partner_txn_id": "VNPAY1234567890",
  "paid_at": "2026-06-12T14:30:22+07:00",
  "signature": "hmac_sha256_signature"
}
```

**payment.failed:**
```json
{
  "event": "payment.failed",
  "transaction_id": "TXN-20260612-A1B2C3",
  "merchant_txn_id": "ORDER-123456",
  "amount": 1500000,
  "currency": "VND",
  "partner": "VNPay",
  "failure_reason": "Khách hàng hủy thanh toán",
  "failed_at": "2026-06-12T14:35:00+07:00",
  "signature": "hmac_sha256_signature"
}
```

**refund.completed:**
```json
{
  "event": "refund.completed",
  "transaction_id": "TXN-20260612-A1B2C3",
  "merchant_txn_id": "ORDER-123456",
  "refund_code": "REF-20260612-XXXXXX",
  "amount": 500000,
  "currency": "VND",
  "partner": "VNPay",
  "partner_refund_id": "VNPAY_REF_123456",
  "refunded_at": "2026-06-12T15:30:00+07:00",
  "signature": "hmac_sha256_signature"
}
```

### 7.3. Webhook Delivery

- **Method**: HTTP POST, JSON body (payload §7.2, không có trường `signature` trong body)
- **Headers**:
  - `X-Webhook-Id`: UUID của thông điệp — giống nhau ở mọi lần retry và replay → merchant chống trùng theo giá trị này
  - `X-Webhook-Event`: mã sự kiện (`payment.success`, …; `webhook.ping` khi test)
  - `X-Timestamp`: unix giây lúc gửi
  - `X-Signature`: `hex(HMAC-SHA256(secret, X-Timestamp + "." + raw_body))` — secret của endpoint (`whsec_…`, chỉ hiển thị một lần khi tạo/đổi)
- **Retry**: gửi ngay, sau đó tối đa 5 lần với backoff 1ph → 5ph → 15ph → 1h → 6h (cấu hình theo endpoint). Mọi phản hồi khác 2xx, timeout hoặc lỗi mạng đều retry; trả 2xx để xác nhận đã nhận.
- **Đảm bảo**: at-least-once (outbox trên bảng `transactions`: `notify_webhook` / `webhook_sent_at`) — merchant phải xử lý idempotent theo `X-Webhook-Id`.

### 7.4. Xác thực Webhook (dành cho merchant)

```python
import hmac, hashlib, time

secret = "whsec_..."
raw_body = request.get_data()                      # bytes đúng như nhận được, không parse lại
timestamp = request.headers["X-Timestamp"]
assert abs(time.time() - int(timestamp)) <= 300    # chống replay
expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request.headers["X-Signature"])
# rồi chống trùng theo request.headers["X-Webhook-Id"]
```

Tham chiếu: BizOne nhận tại `POST /api/webhooks/payhub` (`source/bizone/app/api/webhooks/payhub/route.ts`).

---

## 8. Sequence Diagrams

### 8.1. Luồng thanh toán (Payment Flow)

```
Merchant                Payment Hub              Partner(VNPay)
   │                        │                        │
   │  POST /transactions    │                        │
   ├───────────────────────►│                        │
   │                        │  Create Transaction    │
   │                        │  (Status: Created)     │
   │                        │                        │
   │  { transaction_id,     │                        │
   │    payment_url,        │                        │
   │    qr_code }           │                        │
   │◄───────────────────────┤                        │
   │                        │                        │
   │  Redirect customer     │                        │
   │  to payment_url / QR   │                        │
   │                        │                        │
   │                        │  POST to partner       │
   │                        ├───────────────────────►│
   │                        │                        │
   │                        │  { payment_url }       │
   │                        │◄───────────────────────┤
   │                        │                        │
   │  Customer pays         │                        │
   ├────────────────────────────────────────────────►│
   │                        │                        │
   │                        │  IPN (async)           │
   │                        │◄───────────────────────┤
   │                        │                        │
   │                        │  Verify signature      │
   │                        │  Update status         │
   │                        │  (Status: Success)     │
   │                        │                        │
   │  Webhook: payment.success                       │
   │◄───────────────────────┤                        │
   │                        │                        │
   │  GET /transactions/id  │                        │
   ├───────────────────────►│                        │
   │  { status: Success }   │                        │
   │◄───────────────────────┤                        │
```

### 8.2. Luồng hoàn tiền (Refund Flow)

```
Merchant/Admin            Payment Hub              Partner(VNPay)
   │                        │                        │
   │  POST /refund          │                        │
   ├───────────────────────►│                        │
   │                        │  Check conditions      │
   │                        │  - Status = Success?   │
   │                        │  - Within refund time? │
   │                        │  - Partner supports?   │
   │                        │                        │
   │                        │  POST refund API       │
   │                        ├───────────────────────►│
   │                        │                        │
   │                        │  { refund_confirm }    │
   │                        │◄───────────────────────┤
   │                        │                        │
   │                        │  Update status:        │
   │                        │  Refunded /            │
   │                        │  PartiallyRefunded     │
   │                        │                        │
   │  { refund_code,        │                        │
   │    status: Completed } │                        │
   │◄───────────────────────┤                        │
   │                        │                        │
   │  Webhook: refund.completed                      │
   │◄───────────────────────┤                        │
```

### 8.3. Luồng đối soát (Reconciliation Flow)

```
Scheduler           Payment Hub              Partner API
   │                    │                        │
   │  Trigger daily     │                        │
   │  (00:00)           │                        │
   ├───────────────────►│                        │
   │                    │  Fetch partner          │
   │                    │  transaction report     │
   │                    ├───────────────────────►│
   │                    │                        │
   │                    │  { report data }       │
   │                    │◄───────────────────────┤
   │                    │                        │
   │                    │  Match transactions    │
   │                    │  │                     │
   │                    │  ├─ Matched: OK       │
   │                    │  ├─ Unmatched_PH      │
   │                    │  ├─ Unmatched_Partner │
   │                    │  └─ Amount_Mismatch   │
   │                    │                        │
   │                    │  Generate report       │
   │                    │                        │
   │  Send notification │                        │
   │◄───────────────────┤                        │
   │  (if discrepancies)│                        │
```

---

## 9. WebSocket Events (Real-time)

### Notification Namespace: `/ws/admin/notifications`

| Event | Payload | Mô tả |
|-------|---------|-------|
| `notification:new` | `{ id, type, title, message, reference_type, reference_id }` | Thông báo mới |
| `transaction:update` | `{ txn_code, status, amount, partner }` | Cập nhật trạng thái GD |
| `dashboard:refresh` | `{}` | Dashboard cần refresh |
| `alert:partner_down` | `{ partner, message }` | Đối tác mất kết nối |
| `recon:completed` | `{ run_id, status, discrepancies }` | Đối soát hoàn tất |

### Dashboard Namespace: `/ws/admin/dashboard`

| Event | Payload | Mô tả |
|-------|---------|-------|
| `dashboard:stats` | `{ total_today, amount_today, success_rate }` | Số liệu real-time |

---

## 10. Import/Export

### 10.1. Export

```
POST /api/admin/transactions/export
POST /api/admin/reports/export
POST /api/admin/reconciliation/export
GET  /api/admin/export/{taskId}/status
GET  /api/admin/export/{taskId}/download
```

Định dạng hỗ trợ: `xlsx`, `csv`, `pdf`

### 10.2. Import (Reconciliation data)

```
POST /api/admin/reconciliation/import
Content-Type: multipart/form-data

file: <partner_report.xlsx>
partner_config_id: 1
run_date: 2026-06-12
```

---

## 11. API Reference Summary

### 11.1. Merchant API (Public)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/v1/transactions` | Tạo giao dịch thanh toán |
| GET | `/api/v1/transactions/{id}` | Tra cứu giao dịch |
| GET | `/api/v1/transactions/merchant/{merchant_txn_id}` | Tra cứu theo mã merchant |
| POST | `/api/v1/transactions/{id}/refund` | Yêu cầu hoàn tiền |
| POST | `/api/v1/qr/generate` | Sinh QR thanh toán |
| GET | `/api/v1/partners` | Danh sách đối tác |
| POST | `/api/v1/webhook-test` | Gửi webhook test |

### 11.2. Admin API (Internal)

| Module | Số lượng endpoints | Mô tả |
|--------|-------------------|-------|
| Auth | 6 | Login, refresh, logout, password |
| Dashboard | 1 | Dashboard tổng quan |
| Transactions | 6 | CRUD, chi tiết, refund, export |
| Partners | 6 | CRUD, test, status, logs |
| Connectors | 5 | CRUD, toggle, upload |
| Webhooks | 7 | CRUD, test, toggle, history |
| Webhook Logs | 3 | List, detail, replay |
| Reconciliation | 6 | List, run, detail, update, export |
| Disputes | 4 | CRUD, chi tiết |
| Reports | 4 | Transactions, revenue, reconciliation, export |
| Audit Logs | 2 | List, detail |
| Notifications | 4 | List, read, read-all, unread count |
| Merchants | 5 | CRUD, API keys |
| Users | 4 | CRUD, deactivate |
| Import/Export | 4 | Status, download, import |
| **Total** | **~70** | |

### 11.3. WebSocket Endpoints

| Namespace | Mô tả |
|-----------|-------|
| `/ws/admin/notifications` | Thông báo real-time |
| `/ws/admin/dashboard` | Dashboard real-time |

---

## 12. Integration Partner APIs (IPN/Callback Endpoints)

Payment Hub nhận kết quả thanh toán từ đối tác qua các endpoint sau:

| Endpoint | Mô tả | Đối tác |
|----------|-------|---------|
| `GET /api/ipn/vnpay` | IPN từ VNPay (HMAC-SHA512) — luôn HTTP 200 + `{RspCode, Message}` | VNPay |
| `POST /api/ipn/momo` | IPN từ MoMo (JSON, HMAC-SHA256 trên 13 trường theo thứ tự alphabet) — `204` đã nhận / đã xử lý / còn chờ; `400` sai chữ ký, sai JSON, lệch số tiền; `404` không có đơn; `500` lỗi xử lý | MoMo |
| `POST /api/ipn/zalopay` | Callback từ ZaloPay (JSON `{data, mac, type}`, `mac = HMAC-SHA256(key2, data)`, chỉ gửi khi đã thanh toán) — luôn HTTP 200 + `{return_code, return_message}`: `1` đã nhận / đã xử lý / trùng; `2` sai mac / app_id / dữ liệu, không có đơn, lệch số tiền; `0` lỗi xử lý (ZaloPay gửi lại) | ZaloPay |
| `GET /pay/{vnpay,momo,zalopay}/return` | Trình duyệt khách quay về — chỉ xác thực chữ ký (ZaloPay: `checksum = HMAC-SHA256(key2, appid\|apptransid\|pmcid\|bankcode\|amount\|discountamount\|status)`) rồi chuyển về `return_url` của merchant, **không** đổi trạng thái | VNPay, MoMo, ZaloPay |

Xử lý IPN (P3.3, P5.1, P5.2):
- Xác thực chữ ký bằng secret của đúng `partner_config_id` đã tạo thanh toán; IPN là nguồn sự thật
- Xử lý **đồng bộ** (một `UPDATE … WHERE status = 'Pending'`, ~10–30 ms) để mã phản hồi phản ánh kết quả; IPN lặp → không đổi gì
- "Retry khi thất bại": đối tác tự gửi lại khi nhận mã lỗi; với MoMo, worker còn **truy vấn trạng thái** (`/v2/gateway/api/query`) các GD `Pending` quá 60 s chưa có IPN (mỗi phút, tối đa 20 GD/lượt — `PAYMENT_STATUS_SYNC_*`), và trang `/pay/momo/return` truy vấn một lần khi GD còn `Pending` để `return_url` mang trạng thái thật. ZaloPay (P5.2) dùng cùng cơ chế: worker và `/pay/zalopay/return` gọi `POST /v2/query` (`return_code` 1 = đã trả, 3 = chưa trả / đang xử lý, 2 + mã lỗi thanh toán như `-54` hết hạn = thất bại; mã lỗi API `-401/-402/-429/-500/-999`, `-101` không làm GD thất bại)

---

## 13. API Security Checklist

- [x] HMAC-SHA256 signature cho merchant API
- [x] JWT authentication cho admin API
- [x] RBAC kiểm tra quyền ở server layer
- [x] Rate limiting theo API Key + IP
- [x] Idempotency key cho mutation endpoints
- [x] Input validation (Zod / tRPC validation)
- [x] SQL injection protection (ORM)
- [x] Mã hóa dữ liệu nhạy cảm (AES-256)
- [x] TLS 1.2+ enforced
- [x] Audit log cho mọi thao tác quan trọng
- [x] Webhook signature verification
- [x] IP whitelist (tùy chọn)
- [x] CORS whitelist

---

## 14. Performance Targets

| Endpoint | Target (P95) | Cache Strategy |
|----------|-------------|----------------|
| Create transaction | < 500ms | - |
| Generate QR | < 1s | - |
| Transaction lookup | < 200ms | Redis cache (5 phút) |
| Dashboard | < 3s | Redis aggregate cache (30 giây) |
| Transaction list | < 2s | Indexed + pagination |
| Webhook delivery | < 3s | Queue + async |
| Reconciliation (10K) | < 5 phút | Queue + batch processing |
| Report export | < 10s | Queue + async |
| Partner test | < 5s | Direct API call |

---

## 15. Database Entity Mapping

| Database Table | API Resource | Endpoint |
|----------------|-------------|----------|
| `transactions` | Transaction | `/api/v1/transactions` |
| `partner_configs` | Partner | `/api/admin/partners` |
| `connectors` | Connector | `/api/admin/connectors` |
| `webhook_configs` | Webhook | `/api/admin/webhooks` |
| `webhook_logs` | Webhook Log | `/api/admin/webhook-logs` |
| `reconciliation_runs` | Reconciliation | `/api/admin/reconciliation` |
| `reconciliation_details` | Reconciliation Detail | `/api/admin/reconciliation/{id}/details` |
| `disputes` | Dispute | `/api/admin/disputes` |
| `refunds` | Refund | `/api/v1/transactions/{id}/refund` |
| `transaction_logs` | Transaction Log | `/api/admin/transactions/{id}` (included) |
| `transaction_raw_data` | Raw Data | `/api/admin/transactions/{id}` (included) |
| `audit_logs` | Audit Log | `/api/admin/audit-logs` |
| `notifications` | Notification | `/api/admin/notifications` |
| `merchants` | Merchant | `/api/admin/merchants` |
| `api_keys` | API Key | `/api/admin/merchants/{id}/api-keys` |
| `users` | User | `/api/admin/users` |
| `qr_codes` | QR Code | `/api/v1/qr/generate` |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*

| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 12/06/2026 | 1.0 | | Tạo mới dựa trên URD-PaymentHub.md, SRS-PaymentHub.md và database/schema_paymenthub.sql |
