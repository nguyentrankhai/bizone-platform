# API Design - BizOne Omni Channel POS & Management Platform

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne - Omni Channel POS & Management Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 11/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Tổng quan

### 1.1. Mục tiêu thiết kế API

- **Type-safe**: Sử dụng tRPC cho toàn bộ API nội bộ, đảm bảo type safety từ client đến server
- **RESTful**: API ngoại vi (webhook, tích hợp bên thứ ba) theo chuẩn REST
- **Real-time**: WebSocket cho POS 2 màn hình, đồng bộ tồn kho, thông báo
- **Multi-tenant**: Mỗi tenant một database/schema riêng, API phân tách theo tenant context
- **Performance**: 95th percentile response < 200ms, pagination bắt buộc cho danh sách
- **Audit-ready**: Mọi thao tác CRUD quan trọng đều ghi audit log

### 1.2. Stack công nghệ

| Thành phần | Công nghệ |
|-----------|-----------|
| **Framework** | Next.js 14+ (App Router) |
| **API Layer** | tRPC (server/client), REST cho webhook/integration |
| **Authentication** | NextAuth.js / Lucia Auth (JWT + Refresh Token) |
| **Database** | MariaDB 10.11+ via Prisma/Drizzle ORM |
| **Cache** | Redis (Upstash / self-hosted) |
| **Real-time** | WebSocket (Socket.IO / WebSocket API) |
| **Queue/Job** | BullMQ / Inngest |
| **File Storage** | MinIO / AWS S3 / Cloudflare R2 |

### 1.3. Base URL

```env
# Development
API_BASE_URL=http://localhost:3000/api
WS_URL=ws://localhost:3000/ws

# Staging
API_BASE_URL=https://staging-api.bizone.vn/api
WS_URL=wss://staging-api.bizone.vn/ws

# Production
API_BASE_URL=https://api.bizone.vn/api
WS_URL=wss://api.bizone.vn/ws
```

### 1.4. Authentication

#### JWT Token-based Authentication

```
Header: Authorization: Bearer <access_token>
Header: X-Tenant-ID: <tenant_id>     # Multi-tenant identifier
```

- **Access Token**: 15 phút, chứa user_id, role, branch_id, tenant_id
- **Refresh Token**: 7 ngày, lưu trong `user_sessions` table
- **Token rotation**: Refresh token được thay mới mỗi lần refresh

#### Endpoints

```
POST   /api/auth/login           # Đăng nhập
POST   /api/auth/register        # Đăng ký (admin)
POST   /api/auth/refresh         # Refresh token
POST   /api/auth/logout          # Đăng xuất
POST   /api/auth/change-password # Đổi mật khẩu
POST   /api/auth/forgot-password # Quên mật khẩu
POST   /api/auth/reset-password  # Đặt lại mật khẩu
POST   /api/auth/verify-otp      # Xác thực OTP/2FA
```

### 1.5. Response Format

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
    "message": "Validation failed",
    "details": [
      {
        "field": "phone",
        "message": "Số điện thoại không hợp lệ"
      }
    ]
  }
}
```

#### Error Codes

| Code | HTTP Status | Mô tả |
|------|-------------|-------|
| UNAUTHORIZED | 401 | Token hết hạn hoặc không hợp lệ |
| FORBIDDEN | 403 | Không có quyền |
| NOT_FOUND | 404 | Resource không tồn tại |
| VALIDATION_ERROR | 422 | Dữ liệu không hợp lệ |
| CONFLICT | 409 | Xung đột dữ liệu (trùng SKU, SĐT...) |
| RATE_LIMITED | 429 | Vượt quá giới hạn request |
| INTERNAL_ERROR | 500 | Lỗi máy chủ |
| TENANT_MISMATCH | 403 | Tenant ID không khớp |

### 1.6. Common Query Parameters

| Parameter | Type | Mô tả |
|-----------|------|-------|
| `page` | number | Số trang (default: 1) |
| `pageSize` | number | Số item/trang (default: 20, max: 100) |
| `search` | string | Từ khóa tìm kiếm |
| `sortBy` | string | Trường sắp xếp |
| `sortOrder` | 'asc' \| 'desc' | Chiều sắp xếp |
| `status` | string | Lọc theo trạng thái |
| `fromDate` | ISO date | Lọc từ ngày |
| `toDate` | ISO date | Lọc đến ngày |
| `branchId` | number | Lọc theo chi nhánh |
| `fields` | string | Chọn trường cần trả về (comma-separated) |

### 1.7. Rate Limiting

```
Header: X-RateLimit-Limit: 100
Header: X-RateLimit-Remaining: 95
Header: X-RateLimit-Reset: 1623456789
```

| Loại | Limit | Window |
|------|-------|--------|
| General API | 100 requests | 1 phút |
| POS endpoints | 300 requests | 1 phút |
| Auth endpoints | 10 requests | 1 phút |
| Search endpoints | 60 requests | 1 phút |
| Import/Export | 10 requests | 1 phút |

### 1.8. API Versioning

- API versioning thông qua header: `Accept-Version: 1.0`
- Backward compatibility: version cũ được support tối thiểu 6 tháng
- Breaking changes: thông báo trước 30 ngày qua email + notification

### 1.9. Idempotency

Các mutation endpoint (tạo hóa đơn, thanh toán) hỗ trợ idempotency key:

```
Header: Idempotency-Key: <UUID>
```

- Key lưu trong Redis với TTL 24 giờ
- Request trùng key trong TTL trả về response cũ
- Đảm bảo không tạo trùng hóa đơn/thanh toán

---

## 2. Authentication & Authorization

### 2.1. Roles & Permissions

| Role | Code | Mô tả |
|------|------|-------|
| Admin | `admin` | Chủ cửa hàng - toàn quyền |
| Manager | `manager` | Quản lý vận hành |
| Seller | `seller` | Nhân viên bán hàng |
| Warehouse | `warehouse` | Nhân viên kho |
| Viewer | `viewer` | Chế độ xem |

Permissions được kiểm tra ở cả client và server layer dựa trên bảng `role_permissions`.

### 2.2. Multi-tenant Context

- Mỗi request phải gửi `X-Tenant-ID` header
- Tenant ID xác định database schema chứa dữ liệu
- Admin user có thể switch giữa các branch (chi nhánh) trong cùng tenant

---

## 3. Module: Bán hàng (POS)

### 3.1. Cash Sessions (Ca / Khóa ca)

```
POST   /api/pos/sessions                     # Mở ca
PUT    /api/pos/sessions/:id/close            # Khóa ca
GET    /api/pos/sessions                      # Danh sách ca
GET    /api/pos/sessions/:id                  # Chi tiết ca
GET    /api/pos/sessions/:id/summary          # Tổng kết ca
```

**Mở ca:**
```json
POST /api/pos/sessions
{
  "branchId": 1,
  "openingBalance": 500000
}
```

**Khóa ca:**
```json
PUT /api/pos/sessions/:id/close
{
  "actualClosingBalance": 12500000,
  "notes": "Không có chênh lệch"
}
```

### 3.2. Invoices (Hóa đơn)

```
POST   /api/pos/invoices                      # Tạo hóa đơn
GET    /api/pos/invoices                       # Danh sách hóa đơn
GET    /api/pos/invoices/:id                   # Chi tiết hóa đơn
PUT    /api/pos/invoices/:id                   # Cập nhật hóa đơn
DELETE /api/pos/invoices/:id                   # Hủy hóa đơn
POST   /api/pos/invoices/:id/refund            # Đổi/trả hàng
GET    /api/pos/invoices/:id/print             # Dữ liệu in hóa đơn
POST   /api/pos/invoices/:id/send-email        # Gửi hóa đơn email
POST   /api/pos/invoices/:id/send-sms          # Gửi hóa đơn SMS
```

**Tạo hóa đơn:**
```json
POST /api/pos/invoices
{
  "branchId": 1,
  "cashSessionId": 5,
  "customerId": 12,
  "items": [
    {
      "productId": 101,
      "variantId": null,
      "quantity": 2,
      "unitPrice": 150000,
      "discountPercent": 0,
      "costPrice": 90000
    },
    {
      "productId": 205,
      "variantId": 501,
      "quantity": 1,
      "unitPrice": 250000,
      "discountPercent": 10
    }
  ],
  "payments": [
    {
      "method": "cash",
      "amount": 400000
    },
    {
      "method": "transfer",
      "amount": 100000,
      "referenceCode": "QR12345"
    }
  ],
  "couponCode": "SALE20",
  "notes": ""
}
```

**Đổi/trả hàng:**
```json
POST /api/pos/invoices/:id/refund
{
  "items": [
    {
      "invoiceItemId": 25,
      "productId": 101,
      "quantity": 1,
      "refundAmount": 150000,
      "reason": "Sản phẩm lỗi"
    }
  ],
  "totalRefundAmount": 150000
}
```

### 3.3. POS Real-time Sync (WebSocket)

Kết nối WebSocket cho POS 2 màn hình:

```
WS /ws/pos/{sessionId}
```

**Events (Server → Client):**

| Event | Payload | Mô tả |
|-------|---------|-------|
| `cart:updated` | `{ items, subtotal, discount, total }` | Giỏ hàng thay đổi |
| `cart:cleared` | `{}` | Xóa giỏ hàng |
| `payment:completed` | `{ invoiceId, amount, change }` | Thanh toán hoàn tất |
| `product:scanned` | `{ barcode, product }` | Quét mã vạch thành công |
| `session:status` | `{ status, summary }` | Trạng thái ca thay đổi |

**Events (Client → Server):**

| Event | Payload | Mô tả |
|-------|---------|-------|
| `cart:add` | `{ productId, variantId, quantity }` | Thêm sản phẩm |
| `cart:update` | `{ itemId, quantity }` | Cập nhật số lượng |
| `cart:remove` | `{ itemId }` | Xóa sản phẩm |
| `cart:apply-coupon` | `{ code }` | Áp dụng mã giảm giá |
| `cart:remove-coupon` | `{}` | Xóa mã giảm giá |
| `payment:process` | `{ payments }` | Xử lý thanh toán |

---

## 4. Module: Quản lý Sản phẩm

```
GET    /api/products                          # Danh sách sản phẩm
POST   /api/products                          # Thêm sản phẩm
GET    /api/products/:id                      # Chi tiết sản phẩm
PUT    /api/products/:id                      # Cập nhật sản phẩm
DELETE /api/products/:id                      # Xóa sản phẩm
GET    /api/products/search                   # Tìm kiếm real-time
POST   /api/products/import                   # Import Excel
POST   /api/products/export                   # Export Excel
GET    /api/products/:id/barcode/:code        # Tra cứu theo mã vạch
POST   /api/products/generate-sku             # Sinh SKU tự động

# Categories
GET    /api/products/categories               # Cây danh mục
POST   /api/products/categories               # Thêm danh mục
PUT    /api/products/categories/:id           # Sửa danh mục
DELETE /api/products/categories/:id           # Xóa danh mục
PUT    /api/products/categories/reorder       # Kéo-thả sắp xếp

# Variants
POST   /api/products/:id/variants             # Thêm biến thể
PUT    /api/products/:id/variants/:vid        # Sửa biến thể
DELETE /api/products/:id/variants/:vid        # Xóa biến thể
POST   /api/products/:id/variants/generate    # Sinh biến thể từ thuộc tính

# Units (Đa đơn vị tính)
POST   /api/products/:id/units                # Thêm đơn vị tính
PUT    /api/products/:id/units/:uid           # Cập nhật đơn vị
DELETE /api/products/:id/units/:uid           # Xóa đơn vị

# Combo
POST   /api/products/combos                   # Tạo combo
GET    /api/products/combos/:id               # Chi tiết combo
PUT    /api/products/combos/:id               # Sửa combo
DELETE /api/products/combos/:id               # Xóa combo

# Images
POST   /api/products/:id/images               # Upload ảnh
DELETE /api/products/:id/images/:imgId        # Xóa ảnh
PUT    /api/products/:id/images/reorder       # Sắp xếp ảnh
```

**Thêm sản phẩm:**
```json
POST /api/products
{
  "name": "Áo Thun Nam Cotton",
  "sku": "AO-THUN-NAM-001",
  "barcode": "8934567890123",
  "categoryId": 1,
  "description": "Áo thun nam chất liệu cotton 100%",
  "costPrice": 80000,
  "sellingPrice": 150000,
  "taxRate": 10,
  "unit": "cái",
  "minStock": 10,
  "trackInventory": true,
  "units": [
    { "unitName": "cái", "conversionRate": 1, "sellingPrice": 150000, "isBase": true },
    { "unitName": "thùng", "conversionRate": 12, "sellingPrice": 1600000, "barcode": "8934567890124" }
  ],
  "variants": [
    {
      "sku": "AO-THUN-NAM-001-DEN-M",
      "barcode": "8934567890130",
      "sellingPrice": 150000,
      "attributes": [
        { "name": "Màu sắc", "value": "Đen" },
        { "name": "Kích cỡ", "value": "M" }
      ]
    },
    {
      "sku": "AO-THUN-NAM-001-DEN-L",
      "barcode": "8934567890131",
      "sellingPrice": 150000,
      "attributes": [
        { "name": "Màu sắc", "value": "Đen" },
        { "name": "Kích cỡ", "value": "L" }
      ]
    }
  ]
}
```

**Tìm kiếm real-time:**
```
GET /api/products/search?q=áo thun&pageSize=10&includeInactive=false
```

Response mẫu:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Áo Thun Nam Cotton",
      "sku": "AO-THUN-NAM-001",
      "barcode": "8934567890123",
      "sellingPrice": 150000,
      "unit": "cái",
      "stock": 45,
      "image": "https://storage.bizone.vn/products/ao-thun-001.jpg"
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "pageSize": 10
  }
}
```

---

## 5. Module: Quản lý Kho (Warehouse)

### 5.1. Warehouses

```
GET    /api/warehouses                        # Danh sách kho
POST   /api/warehouses                        # Thêm kho
PUT    /api/warehouses/:id                    # Sửa kho
DELETE /api/warehouses/:id                    # Xóa kho
```

### 5.2. Inventory

```
GET    /api/inventory                         # Tồn kho theo kho
GET    /api/inventory/summary                 # Tổng quan tồn kho
GET    /api/inventory/low-stock               # Hàng sắp hết
GET    /api/inventory/expiring                # Hàng sắp hết hạn
GET    /api/inventory/overdue                 # Hàng tồn lâu (> 90 ngày)
GET    /api/inventory/:productId              # Tồn kho theo sản phẩm
```

### 5.3. Inventory Transactions (Nhập/Xuất kho)

```
GET    /api/inventory/transactions            # Danh sách phiếu
POST   /api/inventory/transactions            # Tạo phiếu nhập/xuất
GET    /api/inventory/transactions/:id        # Chi tiết phiếu
PUT    /api/inventory/transactions/:id        # Cập nhật phiếu
POST   /api/inventory/transactions/:id/confirm # Xác nhận
POST   /api/inventory/transactions/:id/cancel  # Hủy phiếu
```

**Tạo phiếu nhập kho:**
```json
POST /api/inventory/transactions
{
  "transactionTypeId": 1,
  "warehouseId": 1,
  "referenceType": "purchase_order",
  "referenceId": 50,
  "items": [
    {
      "productId": 101,
      "quantity": 100,
      "unitCost": 80000,
      "batchCode": "LOT-20260601",
      "expiryDate": "2027-06-01"
    }
  ],
  "notes": "Nhập kho đơn PO-050"
}
```

### 5.4. Stock Take (Kiểm kê)

```
GET    /api/inventory/stock-takes             # Danh sách phiếu kiểm kê
POST   /api/inventory/stock-takes             # Tạo phiếu kiểm kê
GET    /api/inventory/stock-takes/:id         # Chi tiết phiếu
PUT    /api/inventory/stock-takes/:id         # Cập nhật
POST   /api/inventory/stock-takes/:id/start   # Bắt đầu kiểm kê
POST   /api/inventory/stock-takes/:id/complete # Hoàn tất kiểm kê
POST   /api/inventory/stock-takes/:id/cancel  # Hủy phiếu
PUT    /api/inventory/stock-takes/:id/items/:itemId # Cập nhật số lượng thực tế
```

### 5.5. Batches (Lô / HSD)

```
GET    /api/inventory/batches                 # Danh sách lô
GET    /api/inventory/batches/expiring        # Lô sắp hết hạn
POST   /api/inventory/batches                 # Tạo lô mới
```

### 5.6. Transfer (Chuyển kho)

```
POST   /api/inventory/transfers               # Tạo phiếu chuyển kho
GET    /api/inventory/transfers/:id           # Chi tiết
POST   /api/inventory/transfers/:id/source-confirm  # Xác nhận xuất kho nguồn
POST   /api/inventory/transfers/:id/destination-receive # Nhập kho đích
```

---

## 6. Module: CRM (Quản lý Khách hàng)

```
GET    /api/customers                          # Danh sách khách hàng
POST   /api/customers                          # Thêm khách hàng
GET    /api/customers/:id                      # Chi tiết khách hàng
PUT    /api/customers/:id                      # Cập nhật thông tin
DELETE /api/customers/:id                      # Xóa khách hàng
GET    /api/customers/search                   # Tìm kiếm khách hàng
POST   /api/customers/merge                    # Hợp nhất khách hàng

# Loyalty Points
GET    /api/customers/:id/points               # Lịch sử điểm
POST   /api/customers/:id/points/adjust        # Điều chỉnh điểm
POST   /api/customers/:id/points/redeem        # Đổi điểm

# Purchase History
GET    /api/customers/:id/invoices             # Lịch sử mua hàng
GET    /api/customers/:id/orders               # Lịch sử đơn online

# Debts (Công nợ phải thu)
GET    /api/customers/:id/debts                # Danh sách công nợ
POST   /api/customers/:id/debts/payment        # Ghi nhận thanh toán
GET    /api/customers/debts/overdue            # Công nợ quá hạn

# Groups
GET    /api/customers/groups                   # Danh sách nhóm
POST   /api/customers/groups                   # Thêm nhóm
PUT    /api/customers/groups/:id               # Sửa nhóm
DELETE /api/customers/groups/:id               # Xóa nhóm
```

**Thêm khách hàng:**
```json
POST /api/customers
{
  "fullName": "Nguyễn Văn A",
  "phone": "0987654321",
  "email": "nguyenvana@email.com",
  "gender": "male",
  "birthday": "1990-05-15",
  "groupId": 1,
  "notes": "Khách quen",
  "addresses": [
    {
      "address": "123 Nguyễn Huệ, Q1, TP.HCM",
      "isDefault": true
    }
  ]
}
```

---

## 7. Module: Quản lý Đơn hàng

```
GET    /api/orders                             # Danh sách đơn hàng
GET    /api/orders/:id                         # Chi tiết đơn
PUT    /api/orders/:id/status                  # Cập nhật trạng thái
POST   /api/orders/:id/cancel                  # Hủy đơn
POST   /api/orders/:id/refund                  # Tạo phiếu trả hàng
GET    /api/orders/:id/tracking                # Lịch sử theo dõi

# Filters
GET    /api/orders?channel=shopee&status=shipping&fromDate=2026-06-01&toDate=2026-06-11
```

**Cập nhật trạng thái:**
```json
PUT /api/orders/:id/status
{
  "status": "shipping",
  "shippingProvider": "GHN",
  "trackingCode": "GHN123456789",
  "note": "Đã bàn giao vận chuyển"
}
```

---

## 8. Module: Quản lý Nhân viên

```
GET    /api/staff                              # Danh sách nhân viên
POST   /api/staff                              # Thêm nhân viên
PUT    /api/staff/:id                          # Cập nhật
DELETE /api/staff/:id                          # Xóa nhân viên

# Shifts
GET    /api/staff/shifts                       # Danh sách ca
POST   /api/staff/shifts                       # Tạo ca
PUT    /api/staff/shifts/:id                   # Sửa ca
DELETE /api/staff/shifts/:id                   # Xóa ca
POST   /api/staff/shifts/assign                # Phân ca
GET    /api/staff/shifts/calendar              # Lịch ca dạng calendar

# Attendance
POST   /api/staff/attendance/check-in          # Check-in
POST   /api/staff/attendance/check-out         # Check-out
GET    /api/staff/attendance                   # Bảng chấm công

# Commissions
GET    /api/staff/commissions                  # Danh sách hoa hồng
GET    /api/staff/commissions/rules            # Quy tắc hoa hồng
POST   /api/staff/commissions/rules            # Thêm quy tắc
PUT    /api/staff/commissions/rules/:id        # Sửa quy tắc
POST   /api/staff/commissions/:id/pay          # Thanh toán hoa hồng

# Sales Performance
GET    /api/staff/:id/sales                    # Doanh số theo nhân viên
GET    /api/staff/:id/sales/top                # Top sản phẩm nhân viên bán

# Audit Log
GET    /api/audit-logs                         # Danh sách audit log
GET    /api/audit-logs/export                  # Xuất audit log
```

---

## 9. Module: Báo cáo & Phân tích

```
GET    /api/reports/dashboard                  # Dashboard tổng quan
GET    /api/reports/dashboard/real-time        # Dashboard real-time (WebSocket)

# Revenue
GET    /api/reports/revenue                    # Báo cáo doanh thu
GET    /api/reports/revenue/by-payment-method  # Doanh thu theo PT thanh toán
GET    /api/reports/revenue/by-staff           # Doanh thu theo nhân viên
GET    /api/reports/revenue/by-category        # Doanh thu theo danh mục

# Profit
GET    /api/reports/profit                     # Báo cáo lợi nhuận
GET    /api/reports/profit/top-products        # Top SP lợi nhuận cao
GET    /api/reports/profit/low-products        # Top SP lợi nhuận thấp

# Products
GET    /api/reports/products/best-selling      # Top SP bán chạy
GET    /api/reports/products/slow-moving       # Top SP bán chậm

# Inventory
GET    /api/reports/inventory/value            # Giá trị tồn kho
GET    /api/reports/inventory/aging            # Hàng tồn lâu

# Staff
GET    /api/reports/staff/efficiency           # Hiệu quả nhân viên

# Marketing
GET    /api/reports/marketing/campaigns        # Hiệu quả khuyến mãi

# Export
POST   /api/reports/export                    # Xuất báo cáo (PDF/Excel)
GET    /api/reports/export/:taskId/status      # Kiểm tra trạng thái xuất
GET    /api/reports/export/:taskId/download    # Tải file báo cáo
```

**Dashboard tổng quan:**
```json
GET /api/reports/dashboard?branchId=1
{
  "success": true,
  "data": {
    "today": {
      "revenue": 12500000,
      "orders": 45,
      "newCustomers": 3,
      "productsSold": 87
    },
    "revenueChart": [
      { "date": "2026-06-05", "revenue": 11000000 },
      { "date": "2026-06-06", "revenue": 13500000 }
    ],
    "topProducts": [
      { "productId": 1, "name": "Áo Thun Nam", "quantity": 25, "revenue": 3750000 }
    ],
    "topStaff": [
      { "userId": 5, "name": "Nguyễn Thị B", "orders": 18, "revenue": 5200000 }
    ],
    "alerts": {
      "lowStock": 3,
      "expiring": 2,
      "unprocessedOrders": 5
    }
  }
}
```

---

## 10. Module: Quản lý Nhà cung cấp

```
GET    /api/suppliers                          # Danh sách NCC
POST   /api/suppliers                          # Thêm NCC
PUT    /api/suppliers/:id                      # Cập nhật
DELETE /api/suppliers/:id                      # Xóa NCC

# Purchase Orders
GET    /api/suppliers/purchase-orders          # Danh sách đơn nhập
POST   /api/suppliers/purchase-orders          # Tạo đơn nhập
GET    /api/suppliers/purchase-orders/:id      # Chi tiết đơn nhập
PUT    /api/suppliers/purchase-orders/:id      # Cập nhật
POST   /api/suppliers/purchase-orders/:id/receive # Xác nhận nhập hàng
POST   /api/suppliers/purchase-orders/:id/cancel  # Hủy đơn

# Supplier Debts
GET    /api/suppliers/:id/debts                # Công nợ NCC
POST   /api/suppliers/:id/payments            # Ghi nhận thanh toán

# Price Comparison
GET    /api/suppliers/price-comparison         # So sánh giá nhập
```

---

## 11. Module: Omni Channel (Bán hàng Đa kênh)

### 11.1. Channel Connections

```
GET    /api/omni/channels                      # Danh sách kết nối
POST   /api/omni/channels                      # Kết nối kênh mới
PUT    /api/omni/channels/:id                  # Cập nhật kết nối
DELETE /api/omni/channels/:id                  # Ngắt kết nối
POST   /api/omni/channels/:id/reconnect        # Kết nối lại
POST   /api/omni/channels/:id/sync             # Đồng bộ thủ công
GET    /api/omni/channels/:id/sync-status      # Trạng thái đồng bộ

# Product Sync
POST   /api/omni/channels/:id/products/sync    # Đồng bộ sản phẩm lên kênh
POST   /api/omni/channels/:id/products/pull    # Kéo sản phẩm từ kênh về

# Order Sync
POST   /api/omni/channels/:id/orders/sync     # Đồng bộ đơn từ kênh về
```

### 11.2. Sync Logs

```
GET    /api/omni/sync-logs                     # Lịch sử đồng bộ
```

### 11.3. Webhook Endpoints (REST)

Các webhook nhận dữ liệu từ sàn TMĐT:

```
POST   /api/webhooks/shopee                    # Webhook từ Shopee
POST   /api/webhooks/lazada                    # Webhook từ Lazada
POST   /api/webhooks/tiktok                    # Webhook từ TikTok Shop
POST   /api/webhooks/facebook                  # Webhook từ Facebook/Instagram
POST   /api/webhooks/zalo                      # Webhook từ Zalo OA
```

Webhook payload được validate signature, xử lý bất đồng bộ qua queue, retry tự động khi thất bại.

---

## 12. Module: Kế toán & Tài chính

```
# Cash Funds
GET    /api/accounting/funds                   # Danh sách quỹ
POST   /api/accounting/funds                   # Tạo quỹ
PUT    /api/accounting/funds/:id               # Cập nhật quỹ
GET    /api/accounting/funds/:id/transactions  # Lịch sử biến động quỹ

# Revenue & Expense
GET    /api/accounting/revenue-expense         # Sổ thu chi
POST   /api/accounting/revenue-expense         # Ghi nhận thu/chi
PUT    /api/accounting/revenue-expense/:id     # Sửa
DELETE /api/accounting/revenue-expense/:id     # Xóa
GET    /api/accounting/revenue-expense/categories # Danh mục thu chi
POST   /api/accounting/revenue-expense/categories # Thêm danh mục

# Debts Summary
GET    /api/accounting/debts/receivable        # Công nợ phải thu
GET    /api/accounting/debts/payable           # Công nợ phải trả

# Reports
GET    /api/accounting/reports/profit-loss     # Báo cáo lời lỗ
GET    /api/accounting/reports/cash-flow       # Báo cáo dòng tiền
```

---

## 13. Module: Marketing & Khuyến mãi

### 13.1. Coupons (Mã giảm giá)

```
GET    /api/marketing/coupons                  # Danh sách mã giảm giá
POST   /api/marketing/coupons                  # Tạo mã giảm giá
PUT    /api/marketing/coupons/:id              # Sửa
DELETE /api/marketing/coupons/:id              # Xóa
POST   /api/marketing/coupons/:id/deactivate   # Vô hiệu hóa
GET    /api/marketing/coupons/:id/usage        # Lịch sử sử dụng
```

**Tạo mã giảm giá:**
```json
POST /api/marketing/coupons
{
  "code": "SALE20",
  "name": "Giảm 20% toàn bộ sản phẩm",
  "type": "percent",
  "value": 20,
  "minOrderAmount": 100000,
  "maxDiscount": 200000,
  "usageLimit": 100,
  "usagePerCustomer": 1,
  "startDate": "2026-06-15T00:00:00Z",
  "endDate": "2026-06-30T23:59:59Z",
  "applicableChannels": "pos,online"
}
```

### 13.2. Vouchers

```
GET    /api/marketing/vouchers                 # Danh sách voucher
POST   /api/marketing/vouchers                 # Tạo voucher (gán cho khách)
PUT    /api/marketing/vouchers/:id             # Cập nhật
```

### 13.3. Flash Sales

```
GET    /api/marketing/flash-sales              # Danh sách flash sale
POST   /api/marketing/flash-sales              # Tạo flash sale
PUT    /api/marketing/flash-sales/:id          # Sửa
DELETE /api/marketing/flash-sales/:id          # Xóa
POST   /api/marketing/flash-sales/:id/end      # Kết thúc sớm
```

### 13.4. Promotions

```
GET    /api/marketing/promotions/buy-x-get-y   # DS mua X tặng Y
POST   /api/marketing/promotions/buy-x-get-y   # Tạo
PUT    /api/marketing/promotions/buy-x-get-y/:id # Sửa
DELETE /api/marketing/promotions/buy-x-get-y/:id # Xóa

GET    /api/marketing/promotions/combos        # DS combo khuyến mãi
POST   /api/marketing/promotions/combos        # Tạo
PUT    /api/marketing/promotions/combos/:id    # Sửa
DELETE /api/marketing/promotions/combos/:id    # Xóa
```

### 13.5. Marketing Campaigns

```
GET    /api/marketing/campaigns                # Danh sách chiến dịch
POST   /api/marketing/campaigns                # Tạo chiến dịch
PUT    /api/marketing/campaigns/:id            # Sửa
POST   /api/marketing/campaigns/:id/send       # Gửi chiến dịch
GET    /api/marketing/campaigns/:id/stats      # Thống kê chiến dịch
```

---

## 14. Module: Cài đặt & Cấu hình Hệ thống

```
# Store Configuration
GET    /api/config                             # Lấy tất cả cấu hình
GET    /api/config/:key                        # Lấy cấu hình theo key
PUT    /api/config/:key                        # Cập nhật cấu hình
PUT    /api/config/bulk                        # Cập nhật hàng loạt

# Roles & Permissions
GET    /api/config/roles                       # Danh sách vai trò
GET    /api/config/roles/:id                   # Chi tiết vai trò
POST   /api/config/roles                       # Thêm vai trò
PUT    /api/config/roles/:id                   # Sửa vai trò
DELETE /api/config/roles/:id                   # Xóa vai trò
GET    /api/config/roles/:id/permissions       # Quyền của vai trò
PUT    /api/config/roles/:id/permissions       # Cập nhật quyền
POST   /api/config/roles/:id/clone             # Sao chép vai trò

# Permissions
GET    /api/config/permissions                 # Danh sách quyền (modules)

# Branches
GET    /api/config/branches                    # Danh sách chi nhánh
POST   /api/config/branches                    # Thêm chi nhánh
PUT    /api/config/branches/:id                # Sửa chi nhánh
DELETE /api/config/branches/:id                # Xóa chi nhánh

# Users (Staff Management)
GET    /api/config/users                       # Danh sách user
POST   /api/config/users                       # Thêm user
PUT    /api/config/users/:id                   # Cập nhật user
PUT    /api/config/users/:id/roles             # Gán vai trò
PUT    /api/config/users/:id/branches          # Gán chi nhánh
PUT    /api/config/users/:id/activate          # Kích hoạt
PUT    /api/config/users/:id/deactivate        # Vô hiệu hóa

# Notification Templates
GET    /api/config/notification-templates      # Danh sách template
POST   /api/config/notification-templates      # Thêm template
PUT    /api/config/notification-templates/:id  # Sửa
DELETE /api/config/notification-templates/:id  # Xóa
```

---

## 15. File Upload

```
POST   /api/upload/image                       # Upload hình ảnh
POST   /api/upload/file                        # Upload file (Excel, PDF...)
DELETE /api/upload/:fileId                     # Xóa file
```

**Upload image:**
```
POST /api/upload/image
Content-Type: multipart/form-data

file: <binary>
folder: products    # products | avatars | receipts | reports
```

Response:
```json
{
  "success": true,
  "data": {
    "fileId": "prod-001-abc123",
    "url": "https://storage.bizone.vn/products/prod-001-abc123.jpg",
    "thumbnailUrl": "https://storage.bizone.vn/thumbnails/prod-001-abc123.jpg",
    "size": 245760,
    "mimeType": "image/jpeg"
  }
}
```

---

## 16. Notifications

```
GET    /api/notifications                      # Danh sách thông báo
PUT    /api/notifications/:id/read             # Đánh dấu đã đọc
PUT    /api/notifications/read-all             # Đánh dấu tất cả đã đọc
GET    /api/notifications/unread-count         # Số thông báo chưa đọc
```

### WebSocket Events (Notifications)

```
WS /ws/notifications
```

| Event | Mô tả |
|-------|-------|
| `notification:new` | Thông báo mới |
| `stock:low` | Cảnh báo tồn kho thấp |
| `order:new` | Đơn hàng online mới |
| `sync:failed` | Đồng bộ thất bại |
| `debt:overdue` | Công nợ quá hạn |

---

## 17. Webhooks (Outgoing)

BizOne gửi webhook đến hệ thống bên thứ ba khi có sự kiện:

```
POST /api/config/webhooks                      # Đăng ký webhook
GET  /api/config/webhooks                      # Danh sách webhook
PUT  /api/config/webhooks/:id                  # Sửa
DELETE /api/config/webhooks/:id                # Xóa
POST /api/config/webhooks/:id/test             # Test webhook
```

| Event | Payload | Mô tả |
|-------|---------|-------|
| `invoice.created` | `{ invoiceId, code, total, items }` | Hóa đơn mới |
| `invoice.refunded` | `{ invoiceId, refundAmount }` | Đổi/trả hàng |
| `order.created` | `{ orderId, status, total }` | Đơn online mới |
| `inventory.low` | `{ productId, name, stock }` | Tồn kho thấp |
| `customer.created` | `{ customerId, name, phone }` | Khách hàng mới |

---

## 18. Import/Export

### 18.1. Import (Excel)

```
POST /api/:module/import
Content-Type: multipart/form-data

file: <binary .xlsx>
options: { "sheet": "Sheet1", "hasHeader": true, "mapping": {...} }
```

Quy trình:
1. Upload file → server validate cấu trúc + dữ liệu
2. Trả về `taskId` → client poll status (hoặc WebSocket)
3. Import chạy queue (BullMQ) → ghi log lỗi nếu có

```
GET /api/import/:taskId/status                # Kiểm tra trạng thái
GET /api/import/:taskId/errors                # Download file lỗi
```

### 18.2. Export

```
POST /api/:module/export
{
  "format": "xlsx",
  "filters": { "status": "active", "categoryId": 1 },
  "columns": ["id", "name", "sku", "price", "stock"]
}
```

Response: `{ "taskId": "export-123" }` → poll status → download

```
GET /api/export/:taskId/status
GET /api/export/:taskId/download
```

Định dạng hỗ trợ: `xlsx`, `pdf`, `csv`

---

## 19. API Security Checklist

- [x] JWT authentication cho mọi endpoint (trừ auth)
- [x] RBAC kiểm tra quyền ở server layer
- [x] Multi-tenant isolation qua `X-Tenant-ID`
- [x] Rate limiting theo IP + User
- [x] Idempotency key cho mutation endpoints
- [x] Input validation (Zod / tRPC validation)
- [x] SQL injection protection (ORM)
- [x] XSS protection
- [x] CORS whitelist
- [x] HTTPS enforced
- [x] Audit log cho mọi CRUD quan trọng
- [x] File upload size limit (10MB ảnh, 50MB Excel)
- [x] Webhook signature verification

---

## 20. Performance Targets

| Endpoint | Target (P95) | Cache Strategy |
|----------|-------------|----------------|
| POS: create invoice | < 1s | - |
| POS: search products | < 200ms | Redis cache product list |
| Dashboard | < 2s | Redis aggregate cache (5 phút) |
| Customer list | < 500ms | Redis cache |
| Product list | < 300ms | Redis cache |
| Inventory check | < 200ms | Redis + real-time update |
| Report export | < 5s | Queue + async processing |
| Audit log query | < 1s | Indexed + pagination |

---

## 21. WebSocket Events Summary

| Namespace | Events | Mô tả |
|-----------|--------|-------|
| `/ws/pos/:sessionId` | cart, payment, session | POS 2 màn hình |
| `/ws/notifications` | notification, stock, order, sync | Thông báo real-time |
| `/ws/dashboard` | revenue, orders, inventory | Dashboard real-time |
| `/ws/inventory` | stock-change, low-stock | Cập nhật tồn kho |

---

## 22. API Endpoint Map (Summary)

| Module | Số lượng endpoints | Ghi chú |
|--------|-------------------|---------|
| Auth | 8 | Login, register, refresh, OTP... |
| POS | 12 | Sessions, invoices, refunds, print |
| Products | 25 | CRUD, categories, variants, units, combos |
| Warehouse | 25 | Inventory, transactions, stock take, batches, transfers |
| CRM | 18 | Customers, points, debts, groups, history |
| Orders | 8 | CRUD, status, tracking, refunds |
| Staff | 18 | Users, shifts, attendance, commissions, audit |
| Reports | 16 | Dashboard, revenue, profit, export |
| Suppliers | 14 | CRUD, purchase orders, payments, price comparison |
| Omni Channel | 10 | Connections, sync, logs, webhooks |
| Accounting | 13 | Funds, revenue/expense, debts, reports |
| Marketing | 20 | Coupons, vouchers, flash sales, promotions |
| Config | 20 | Store config, roles, branches, users, templates |
| Upload | 3 | Image, file, delete |
| Notifications | 4 | List, read, unread count |
| Import/Export | 6 | Upload, status, errors, download |
| **Total** | **~220** | |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*

| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 11/06/2026 | 1.0 | | Tạo mới dựa trên SRS-BizOne.md, database/schema.sql và env.txt |
