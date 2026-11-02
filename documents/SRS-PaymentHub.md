# SRS - Software Requirements Specification

## Payment Hub - Hệ thống Trung gian Thanh toán Tập trung

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne Payment Hub - Payment Gateway Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 12/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Giới thiệu

### 1.1. Mục đích

Tài liệu này mô tả chi tiết các yêu cầu phần mềm (Software Requirements Specification) cho hệ thống **Payment Hub** - nền tảng trung gian xử lý thanh toán tập trung của hệ sinh thái BizOne. Tài liệu được xây dựng dựa trên URD-PaymentHub.md, nhằm cung cấp đầy đủ thông tin cho nhóm phát triển, kiểm thử và triển khai.

### 1.2. Phạm vi

Hệ thống Payment Hub bao gồm 8 module chính:
1. Quản lý Đối tác Thanh toán
2. Quản lý Giao dịch
3. Hoàn tiền (Refund)
4. Webhook / Callback
5. Đối soát & Tra soát
6. Dashboard & Báo cáo
7. Audit Log & Bảo mật
8. Connector Engine

### 1.3. Định nghĩa, thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| Payment Hub | Hệ thống trung gian xử lý thanh toán tập trung |
| IPN | Instant Payment Notification - Thông báo thanh toán tức thời từ đối tác |
| Webhook | Callback HTTP được gửi khi có sự kiện |
| VietQR | Chuẩn QR Code thanh toán liên ngân hàng tại Việt Nam |
| Napas QR | Chuẩn QR Code của Napas (National Payment Corporation of Vietnam) |
| Connector | Module plugin kết nối với đối tác thanh toán |
| PSP | Payment Service Provider - Nhà cung cấp dịch vụ thanh toán (VNPay, MoMo, ZaloPay,...) |
| Connector Registry | Thành phần quản lý danh sách Connector đã đăng ký và trạng thái hoạt động |
| Connector Manager | Service quản lý vòng đời Connector (register, activate, deactivate, remove) |
| Mapping Layer | Lớp chuyển đổi dữ liệu giữa Core DTO chuẩn hóa và định dạng riêng của từng PSP |
| DTO | Data Transfer Object - Đối tượng dữ liệu chuẩn giao tiếp giữa Core và Connector |
| Vault/KMS | Hệ thống lưu trữ secret tập trung (HashiCorp Vault / AWS KMS) |
| Hot-Plug | Khả năng thêm/bật/tắt Connector mà không cần restart hệ thống |
| HMAC | Hash-based Message Authentication Code - Phương thức xác thực chữ ký |
| Refund | Hoàn tiền cho giao dịch đã thanh toán |
| Reconciliation | Đối soát giao dịch giữa các hệ thống |
| Merchant | Đơn vị chấp nhận thanh toán (BizOne hoặc bên thứ ba) |
| Exponential Backoff | Chiến lược retry với thời gian tăng dần sau mỗi lần thất bại |
| Idempotency | Tính chất đảm bảo một request chỉ được xử lý một lần |

### 1.4. Tài liệu tham khảo

| Tài liệu | Mô tả |
|----------|-------|
| URD-PaymentHub.md | User Requirements Document - Payment Hub |
| SRS-BizOne.md | Software Requirements Specification - BizOne |
| BRD-BizOne.md | Business Requirements Document |

---

## 2. Mô tả tổng quan hệ thống

### 2.1. Góc nhìn sản phẩm

Payment Hub là hệ thống trung gian thanh toán tập trung, hoạt động như một Payment Gateway Platform, cho phép các hệ thống trong hệ sinh thái BizOne (POS, Website, Mobile) tích hợp thanh toán qua một API duy nhất mà không cần kết nối trực tiếp với từng đối tác thanh toán (VNPay, MoMo, ZaloPay,...).

### 2.2. Đặc điểm người dùng

| Nhóm | Vai trò | Mục tiêu chính |
|------|---------|----------------|
| System Admin | Quản trị viên hệ thống thanh toán | Cấu hình đối tác, quản lý giao dịch, giám sát vận hành |
| BizOne Owner | Chủ doanh nghiệp sử dụng Payment Hub | Theo dõi dòng tiền, đối soát doanh thu, báo cáo thanh toán |
| Developer | Lập trình viên tích hợp API thanh toán | Tích hợp API tạo giao dịch, nhận webhook, xử lý kết quả |
| Operations Staff | Nhân viên vận hành | Xử lý tra soát giao dịch, thực hiện hoàn tiền, kiểm tra đối soát |
| Partner Manager | Quản lý đối tác thanh toán | Quản lý kết nối đối tác, theo dõi hiệu suất, xử lý sự cố |

### 2.3. Môi trường hoạt động

- **Web App**: Giao diện quản trị web (Dashboard, quản lý giao dịch, đối tác, báo cáo)
- **API Service**: REST API cho hệ thống BizOne và bên thứ ba tích hợp
- **Worker Service**: Xử lý bất đồng bộ (webhook, đối soát, scheduled jobs)

### 2.4. Ràng buộc thiết kế và triển khai

- Kiến trúc Connector plugin cho phép thêm đối tác mới mà không sửa core, hỗ trợ hot-plug
- Mỗi Connector được cô lập hoàn toàn với Core và các Connector khác (fault isolation)
- Xử lý bất đồng bộ cho các tác vụ nặng (đối soát, gửi webhook)
- Hỗ trợ horizontal scaling
- Mã hóa dữ liệu nhạy cảm (API Key, Secret Key) trong database/Vault/KMS
- Hỗ trợ đa giao thức kết nối (REST, SOAP, MQ, SFTP, OpenAPI, Proprietary API)
- Connector có versioning riêng, cho phép nâng cấp độc lập
- Secret không được ghi trong log hệ thống

---

## 3. Kiến trúc hệ thống

### 3.1. Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Web Admin   │  │  BizOne POS  │  │  BizOne Online   │   │
│  │  (NextJS)    │  │  (API call)  │  │  (API call)      │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
└─────────┼─────────────────┼───────────────────┼──────────────┘
          │                 │                   │
          │           ┌─────┴─────┐             │
          │           │   HTTPS   │             │
          │           └─────┬─────┘             │
          │                 │                   │
┌─────────▼─────────────────▼───────────────────▼──────────────┐
│                    API Gateway Layer                            │
│         Rate Limiting / Auth / IP Whitelist / Logging          │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│                       Core Service Layer                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Transaction    │  │    Route       │  │   Webhook      │  │
│  │   Engine       │  │    Engine      │  │    Engine      │  │
│  │  (Create/Lookup│  │  (Partner      │  │  (Send/Retry/  │  │
│  │   Refund/QR)   │  │   Selection)   │  │   Replay)      │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  Recon Engine  │  │  Notification  │  │   Audit Log    │  │
│  │  (Matching/    │  │    Engine      │  │    Engine      │  │
│  │   Report)      │  │  (WS/Email)    │  │  (Append-only) │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│                     Connector Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  VNPay   │ │   MoMo   │ │ ZaloPay  │ │   Custom         │ │
│  │Connector │ │Connector │ │Connector │ │   Connector      │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬──────────┘ │
└───────┼────────────┼────────────┼────────────────┼────────────┘
        │            │            │                │
┌───────▼────────────▼────────────▼────────────────▼───────────┐
│                    External Partners API                        │
│     VNPay API      MoMo API     ZaloPay API     ...           │
└───────────────────────────────────────────────────────────────┘
```

### 3.2. Stack công nghệ

| Thành phần | Công nghệ | Ghi chú |
|-----------|-----------|---------|
| **Frontend** | NextJS 14+ (App Router), React, TailwindCSS, shadcn/ui | Web Admin Dashboard |
| **Backend** | Next.js API Routes / tRPC / Node.js Microservices | Core services |
| **Database** | MariaDB / PostgreSQL | ACID compliant, transaction storage |
| **Cache** | Redis | Session, rate limiting, temporary QR data |
| **Queue/Job** | BullMQ / Inngest | Async processing (webhook, recon) |
| **Authentication** | NextAuth.js / Lucia Auth | JWT-based |
| **WebSocket** | Socket.IO / WebSocket API | Real-time dashboard |
| **Deployment** | Docker + Docker Compose | Containerized |
| **File Storage** | MinIO / AWS S3 | QR code images, reports |

### 3.3. Kiến trúc Connector Plugin (Extensible Payment Connector Framework)

Hệ thống áp dụng mô hình **Connector Plugin Architecture** cho phép tích hợp nhiều PSP mà không ảnh hưởng đến Core Payment Hub.

#### 3.3.1. Mục tiêu

| Mục tiêu | Mô tả |
|----------|-------|
| Chuẩn hóa tích hợp PSP | Mọi PSP đều tuân theo interface contract thống nhất |
| Zero-core-change | Bổ sung PSP mới không cần sửa đổi mã nguồn Core |
| Fault isolation | Lỗi một Connector không ảnh hưởng Core và Connector khác |
| Triển khai độc lập | Connector có thể deploy, upgrade, remove độc lập |
| Đa giao thức | Hỗ trợ REST, SOAP, MQ, SFTP, OpenAPI, Proprietary API |

#### 3.3.2. Interface Contract

Mọi Connector phải triển khai interface chuẩn:

| Phương thức | Mô tả | Bắt buộc |
|-------------|-------|----------|
| `createTransaction(dto)` | Tạo giao dịch thanh toán qua PSP | Có |
| `processResult(rawData)` | Xử lý kết quả thanh toán từ PSP | Có |
| `refund(transactionId, amount)` | Yêu cầu hoàn tiền | Có |
| `verifySignature(payload, signature)` | Xác thực chữ ký từ PSP | Có |
| `getStatus(transactionId)` | Tra cứu trạng thái giao dịch | Có |
| `generateQR(data)` | Sinh QR Code theo chuẩn PSP | Không |
| `getConfigSchema()` | Trả về schema cấu hình riêng của Connector | Có |
| `healthCheck()` | Kiểm tra trạng thái kết nối PSP | Có |

#### 3.3.3. Chuẩn hóa Model dữ liệu (DTO)

Core sử dụng DTO chuẩn nội bộ, Connector chịu trách nhiệm mapping sang định dạng PSP:

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Core DTO   │ ──► │  Mapping Layer   │ ──► │   PSP Format │
│  (chuẩn hóa) │ ◄── │  (Connector)     │ ◄── │  (riêng)     │
└──────────────┘     └──────────────────┘     └──────────────┘
```

**Core DTO - PaymentRequest:**
```
{
  id: string (UUID)
  merchant_txn_id: string
  merchant_id: string
  amount: decimal(15,0)
  currency: string
  description: string
  payment_method: string
  return_url: string
  webhook_url: string
  customer: { name, email, phone }
  metadata: json
  expired_at: datetime
}
```

**Core DTO - PaymentResult:**
```
{
  success: boolean
  transaction_id: string
  partner_txn_id: string
  status: string
  amount: decimal(15,0)
  paid_amount: decimal(15,0)
  paid_at: datetime
  partner_raw: json
  error_code: string
  error_message: string
}
```

#### 3.3.4. Connector Registry

**Connector Manager** quản lý danh sách Connector đang hoạt động:

| Thành phần | Trách nhiệm |
|------------|-------------|
| **Registry Store** | Lưu danh sách Connector đã đăng ký (id, name, version, status, config schema) |
| **Health Monitor** | Kiểm tra sức khỏe định kỳ từng Connector, cập nhật trạng thái |
| **Route Engine** | Dựa vào payment method để chọn Connector phù hợp khi tạo giao dịch |
| **Lifecycle Manager** | Xử lý register, activate, deactivate, remove Connector |

**Connector Registry Flow:**
```
                    ┌──────────────────┐
                    │  Connector       │
                    │  Manager         │
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Registry Store  │ │  Health Monitor  │ │  Route Engine    │
│  (Connector list)│ │  (Heartbeat)     │ │  (Routing table) │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

#### 3.3.5. Hot-Plug Connector

Hệ thống hỗ trợ bổ sung Connector mới mà không cần restart Core Payment Hub:

| Yêu cầu | Mô tả |
|---------|-------|
| Register | Connector plugin được đăng ký vào Registry khi deploy (qua API hoặc file cấu hình) |
| Activate | Kích hoạt Connector để bắt đầu nhận request, cập nhật routing table mà không downtime |
| Deactivate | Vô hiệu hóa Connector tạm thời (bảo trì), request tự động chuyển sang Connector khác |
| Remove | Gỡ bỏ Connector hoàn toàn khỏi Registry |
| Update | Nâng cấp Connector lên version mới, hỗ trợ zero-downtime update |

```
User upload/register Connector
         │
         ▼
Connector Manager kiểm tra tính tương thích
         │
         ▼
Lưu vào Registry Store
         │
         ▼
Health Monitor kiểm tra kết nối
         │
         ▼
Cập nhật Routing Table
         │
         ▼
Connector sẵn sàng nhận request
```

#### 3.3.6. Isolation (Cô lập Connector)

Mỗi Connector được cô lập ở nhiều cấp độ:

| Cấp độ | Cơ chế | Mô tả |
|--------|--------|-------|
| **Process isolation** | Container/VM | Mỗi Connector chạy trong container riêng (tùy chọn) |
| **Error isolation** | Try-Catch boundary | Lỗi Connector không làm sập tiến trình Core |
| **Timeout isolation** | Circuit breaker | Tự động ngắt kết nối khi Connector timeout > ngưỡng |
| **Resource isolation** | Rate limiter riêng | Mỗi Connector có rate limit và resource quota riêng |
| **State isolation** | Config riêng | Mỗi Connector lưu cấu hình và trạng thái riêng biệt |
| **Thread pool isolation** | Executor riêng | Mỗi Connector xử lý trên thread pool độc lập |

#### 3.3.7. Security Contract

Mọi Connector phải tuân thủ:

| Yêu cầu | Mô tả |
|---------|-------|
| TLS 1.2+ | Mọi kết nối với PSP đều qua TLS |
| Authentication | API Key hoặc OAuth2 tùy theo yêu cầu PSP |
| HMAC Signature | Xác thực chữ ký request/response với PSP |
| Secret Management | Secret được lưu trong Vault/KMS, không lưu trong code hay config file |
| No sensitive logging | Không ghi log dữ liệu nhạy cảm (PAN, CVV, API Key, Secret) |
| Encryption at rest | Mã hóa thông tin thanh toán khi lưu trữ |

#### 3.3.8. Versioning

| Yêu cầu | Mô tả |
|---------|-------|
| Connector version | Mỗi Connector có version riêng theo semantic versioning (MAJOR.MINOR.PATCH) |
| API version | Mỗi Connector công bố phiên bản API PSP mà nó hỗ trợ |
| Core compatibility | Connector khai báo phiên bản Core tương thích |
| Migration | Hỗ trợ nâng cấp Connector với backward compatibility |
| Changelog | Mỗi phiên bản Connector có changelog bắt buộc |

#### 3.3.9. Monitoring & Audit

Theo dõi riêng cho từng Connector:

**Metrics:**
| Metric | Mô tả | Ngưỡng cảnh báo |
|--------|-------|-----------------|
| TPS | Transactions per second | > 80% capacity |
| Latency | Thời gian phản hồi trung bình | > 5 giây |
| Success Rate | Tỷ lệ giao dịch thành công | < 95% |
| Failure Rate | Tỷ lệ giao dịch thất bại | > 5% |
| Timeout Rate | Tỷ lệ timeout | > 2% |
| Refund Success Rate | Tỷ lệ hoàn tiền thành công | < 90% |

**Logs:**
| Loại log | Nội dung |
|----------|----------|
| Request Log | Log request đến PSP (che dấu sensitive data) |
| Response Log | Log response từ PSP |
| Callback Log | Log IPN/webhook từ PSP |
| Audit Log | Log thay đổi cấu hình Connector |

**Alerts:**
| Alert | Điều kiện | Hành động |
|-------|-----------|-----------|
| Connector Down | Health check fails 3 lần liên tiếp | Thông báo Admin, auto-deactivate |
| High Error Rate | Failure rate > 10% trong 5 phút | Thông báo Admin |
| High Latency | Latency > 10 giây trong 3 phút | Thông báo Admin |
| Webhook Failure | Webhook fails > 5 lần liên tiếp | Thông báo Admin |

#### 3.3.10. Quy trình thêm PSP mới

```
Bước 1: Implement PaymentConnector Interface
         ├── Implement các phương thức bắt buộc
         └── Tuân thủ Security Contract

Bước 2: Implement Mapping Layer
         ├── Core DTO → PSP Format
         └── PSP Format → Core DTO

Bước 3: Package Connector
         ├── Build thành plugin package (Docker image / JAR / npm package)
         └── Kèm file cấu hình mẫu và tài liệu

Bước 4: Deploy Connector
         ├── Deploy lên môi trường (sandbox → production)
         └── Connector Manager tự động phát hiện và register

Bước 5: Activate Connector
         ├── Chạy health check → verify kết nối PSP
         └── Kích hoạt → cập nhật routing table

Bước 6: Cấu hình Merchant Account
         ├── Cấu hình API Key, Merchant Code cho từng merchant
         └── Test giao dịch sandbox

Bước 7: Ready for Production
         ├── Monitoring metrics
         └── Go-live
```

**Kết quả:** Payment Hub Core hoàn toàn không cần sửa đổi khi tích hợp thêm PSP mới; chỉ cần phát triển Connector tuân thủ Interface Contract và đăng ký vào Connector Registry.

---

## 4. Yêu cầu chức năng

### 4.1. Module Quản lý Đối tác Thanh toán

#### SRS-PH-PARTNER-01: Cấu hình đối tác thanh toán

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-PARTNER-01-01 | Danh sách đối tác | Hiển thị danh sách đối tác đã cấu hình với trạng thái (Hoạt động / Ngưng / Lỗi kết nối) | Cao |
| SRS-PH-PARTNER-01-02 | Thêm đối tác | Form thêm đối tác với các trường: loại Connector, API Key, Secret Key, Merchant Code, Endpoint (Sandbox/Production), callback URL, webhook URL, timeout, retry policy | Cao |
| SRS-PH-PARTNER-01-03 | Test kết nối | Gửi request test đến đối tác, chỉ cho phép kích hoạt khi kết nối thành công | Cao |
| SRS-PH-PARTNER-01-04 | Cập nhật cấu hình | Cho phép sửa thông tin, vô hiệu hóa tạm thời, kích hoạt lại đối tác | Cao |
| SRS-PH-PARTNER-01-05 | Log thay đổi | Ghi log lịch sử thay đổi cấu hình đối tác (người thực hiện, thời gian, dữ liệu cũ/mới) | Trung bình |
| SRS-PH-PARTNER-01-06 | Môi trường | Hỗ trợ cấu hình riêng cho Sandbox và Production | Cao |

#### SRS-PH-PARTNER-02: Quản lý Connector mở rộng

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-PARTNER-02-01 | Danh sách Connector | Hiển thị danh sách Connector plugin có sẵn, trạng thái (Đã cài / Đang hoạt động / Ngưng / Lỗi) | Cao |
| SRS-PH-PARTNER-02-02 | Upload Connector | Upload Connector plugin mới theo định dạng chuẩn, kiểm tra tính tương thích với Core | Cao |
| SRS-PH-PARTNER-02-03 | Cấu hình Connector | Cấu hình tham số riêng cho từng Connector theo schema do Connector định nghĩa | Cao |
| SRS-PH-PARTNER-02-04 | Kích hoạt/Vô hiệu hóa | Kích hoạt hoặc vô hiệu hóa Connector, hỗ trợ hot-plug (không restart) | Cao |
| SRS-PH-PARTNER-02-05 | Interface chuẩn | Connector phải implement interface chuẩn với các phương thức bắt buộc: `createTransaction`, `processResult`, `refund`, `verifySignature`, `getConfigSchema`, `healthCheck` | Cao |
| SRS-PH-PARTNER-02-06 | Connector Registry | Hệ thống có Connector Manager quản lý danh sách Connector trong Registry, hỗ trợ register/activate/deactivate/remove | Cao |
| SRS-PH-PARTNER-02-07 | Hot-Plug | Thêm/kích hoạt/vô hiệu hóa Connector không yêu cầu restart Core Payment Hub, routing table cập nhật tự động | Cao |
| SRS-PH-PARTNER-02-08 | Fault Isolation | Mỗi Connector được cô lập (error isolation, timeout isolation, resource isolation). Lỗi một Connector không ảnh hưởng Core và Connector khác | Cao |
| SRS-PH-PARTNER-02-09 | Circuit Breaker | Tự động ngắt kết nối Connector khi timeout/error vượt ngưỡng, tự động phục hồi khi ổn định | Cao |
| SRS-PH-PARTNER-02-10 | Versioning | Mỗi Connector có version riêng (semantic versioning), hiển thị version hiện tại, hỗ trợ nâng cấp | Trung bình |
| SRS-PH-PARTNER-02-11 | Health Check | Health Monitor tự động kiểm tra kết nối Connector định kỳ, cập nhật trạng thái real-time | Cao |
| SRS-PH-PARTNER-02-12 | Security Contract | Connector tuân thủ security contract: TLS 1.2+, HMAC signature, không log sensitive data | Cao |
| SRS-PH-PARTNER-02-13 | Secret Management | Secret/API Key được lưu trong Vault/KMS, không lưu trong code hoặc config file | Cao |
| SRS-PH-PARTNER-02-14 | Multi-protocol | Connector hỗ trợ nhiều giao thức kết nối: REST, SOAP, MQ, SFTP, OpenAPI, Proprietary API | Trung bình |
| SRS-PH-PARTNER-02-15 | PSP Onboarding | Hỗ trợ quy trình thêm PSP mới qua UI: upload → test → activate → monitoring, Core không cần sửa đổi | Cao |

#### SRS-PH-PARTNER-03: Dashboard giám sát Connector

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-PARTNER-03-01 | Metrics real-time | Hiển thị real-time metrics cho từng Connector: TPS, Latency, Success Rate, Failure Rate, Timeout Rate | Cao |
| SRS-PH-PARTNER-03-02 | Trạng thái Connector | Hiển thị trạng thái Connector (Hoạt động / Ngưng / Lỗi / Bảo trì) kèm thời gian uptime | Cao |
| SRS-PH-PARTNER-03-03 | Health Check Log | Lịch sử health check, kết quả gần nhất, thời gian phản hồi | Trung bình |
| SRS-PH-PARTNER-03-04 | Biểu đồ hiệu năng | Biểu đồ TPS, Latency, Success Rate theo thời gian (1h, 24h, 7 ngày) | Trung bình |
| SRS-PH-PARTNER-03-05 | Cảnh báo Connector | Cảnh báo khi Connector down, high error rate, high latency, webhook failure | Cao |
| SRS-PH-PARTNER-03-06 | Topology view | Sơ đồ kiến trúc kết nối: Core → Connector → PSP, trạng thái từng node | Thấp |

### 4.2. Module Quản lý Giao dịch

#### SRS-PH-TXN-01: Tạo giao dịch thanh toán (qua API)

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-TXN-01-01 | Tạo giao dịch | API RESTful POST `/api/v1/transactions` nhận thông tin: merchant_txn_id, amount, currency, description, payment_method, return_url, webhook_url, customer info, metadata | Cao |
| SRS-PH-TXN-01-02 | Xác thực API | Xác thực qua API Key + HMAC-SHA256 signature trong header | Cao |
| SRS-PH-TXN-01-03 | Idempotency | Tự động chống trùng lặp giao dịch (idempotency key) | Cao |
| SRS-PH-TXN-01-04 | Kiểm tra hạn mức | Kiểm tra Merchant ID, API key hợp lệ, hạn mức giao dịch | Cao |
| SRS-PH-TXN-01-05 | Response | Trả về Transaction ID nội bộ, URL thanh toán, QR Code (tùy phương thức) trong < 500ms | Cao |
| SRS-PH-TXN-01-06 | Validate input | Validate số tiền > 0, URL hợp lệ, thông tin bắt buộc đầy đủ | Cao |

#### SRS-PH-TXN-02: Sinh QR thanh toán

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-TXN-02-01 | Sinh QR | API POST `/api/v1/qr/generate` sinh QR Code theo loại (VietQR, Napas QR, QR đối tác) | Cao |
| SRS-PH-TXN-02-02 | Định dạng | Trả về Base64 image, URL, raw data của QR Code | Cao |
| SRS-PH-TXN-02-03 | Chuẩn VietQR | QR tuân thủ chuẩn VietQR (EMVCo - VietQR) cho Napas | Cao |
| SRS-PH-TXN-02-04 | Timeout | QR có hạn sử dụng (timeout) có thể cấu hình | Trung bình |
| SRS-PH-TXN-02-05 | Kích thước | Hỗ trợ các kích thước: 200x200, 300x300, 500x500 | Trung bình |
| SRS-PH-TXN-02-06 | Tự động refresh | Tự động refresh QR khi hết hạn | Trung bình |
| SRS-PH-TXN-02-07 | Hiệu năng | Sinh QR trong < 1 giây | Cao |

#### SRS-PH-TXN-03: Xử lý kết quả thanh toán

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-TXN-03-01 | Nhận IPN | Nhận và xác thực IPN từ đối tác, response HTTP 200 OK ngay lập tức | Cao |
| SRS-PH-TXN-03-02 | Xác thực chữ ký | Xác thực chữ ký HMAC/RSA từ đối tác, kiểm tra checksum dữ liệu | Cao |
| SRS-PH-TXN-03-03 | Cập nhật trạng thái | Cập nhật trạng thái giao dịch (Success/Failed) sau khi xác thực và kiểm tra tính hợp lệ | Cao |
| SRS-PH-TXN-03-04 | Kiểm tra số tiền | Kiểm tra số tiền khớp với giao dịch gốc, giao dịch tồn tại | Cao |
| SRS-PH-TXN-03-05 | Xử lý Redirect | Kiểm tra tham số trên URL redirect, cập nhật trạng thái, chuyển hướng đến Return URL | Cao |
| SRS-PH-TXN-03-06 | Async processing | Xử lý bất đồng bộ sau khi response 200 cho IPN | Cao |
| SRS-PH-TXN-03-07 | Retry xử lý | Retry tối đa 3 lần nếu xử lý IPN thất bại | Trung bình |
| SRS-PH-TXN-03-08 | Thời gian xử lý | Xử lý IPN/Webhook từ đối tác trong < 2 giây (từ nhận đến cập nhật trạng thái) | Cao |

#### SRS-PH-TXN-04: Tra cứu giao dịch

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-TXN-04-01 | Danh sách giao dịch | Hiển thị danh sách giao dịch dạng bảng với các cột: Mã GD, Thời gian, Số tiền, Phương thức, Trạng thái (màu sắc), Đối tác, Nguồn | Cao |
| SRS-PH-TXN-04-02 | Bộ lọc | Lọc theo: khoảng thời gian, trạng thái, đối tác, merchant, khoảng tiền, mã giao dịch/mã đơn hàng | Cao |
| SRS-PH-TXN-04-03 | Chi tiết giao dịch | Hiển thị thông tin cơ bản, thông tin thanh toán, thông tin khách hàng, log giao dịch, dữ liệu raw request/response | Cao |
| SRS-PH-TXN-04-04 | Màu trạng thái | Xanh - Success, Đỏ - Failed, Vàng - Pending, Xám - Expired | Trung bình |
| SRS-PH-TXN-04-05 | Phân trang | Hỗ trợ phân trang danh sách | Cao |
| SRS-PH-TXN-04-06 | Xuất báo cáo | Xuất danh sách giao dịch ra Excel/CSV | Trung bình |
| SRS-PH-TXN-04-07 | Tra cứu API | API GET `/api/v1/transactions/{id}` và `/api/v1/transactions/merchant/{merchant_txn_id}` | Cao |
| SRS-PH-TXN-04-08 | Hiệu năng | Tra cứu giao dịch trong < 2 giây | Cao |

#### SRS-PH-TXN-05: Quản lý vòng đời giao dịch

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-TXN-05-01 | State machine | Quản lý vòng đời giao dịch: Created → Pending → Success/Failed/Expired; Success → Refunded | Cao |
| SRS-PH-TXN-05-02 | Auto transition | Tự động chuyển trạng thái khi nhận kết quả từ đối tác | Cao |
| SRS-PH-TXN-05-03 | Auto expire | Scheduled job tự động expire giao dịch quá hạn | Cao |
| SRS-PH-TXN-05-04 | State change log | Ghi log mỗi lần thay đổi trạng thái (timestamp, lý do, dữ liệu cũ/mới) | Cao |
| SRS-PH-TXN-05-05 | Immutable state | Không cho phép thay đổi trạng thái thủ công (trừ refund) | Trung bình |

**State Machine:**

```
Created
   │
   ▼
Pending ───→ Success
   │            │
   ├──→ Failed  ├──→ Refunded (full)
   │            └──→ Partially Refunded
   │
   └──→ Expired
```

### 4.3. Module Hoàn tiền (Refund)

#### SRS-PH-REFUND-01: Hoàn tiền toàn phần

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-REFUND-01-01 | UI hoàn tiền | Nút "Hoàn tiền" trong chi tiết giao dịch (chỉ khi trạng thái Success) | Cao |
| SRS-PH-REFUND-01-02 | Kiểm tra điều kiện | Kiểm tra đối tác hỗ trợ refund, thời gian cho phép refund | Cao |
| SRS-PH-REFUND-01-03 | Nhập lý do | Form nhập lý do hoàn tiền (bắt buộc) | Cao |
| SRS-PH-REFUND-01-04 | Gửi request | Gửi request refund đến đối tác thanh toán | Cao |
| SRS-PH-REFUND-01-05 | Cập nhật trạng thái | Cập nhật trạng thái giao dịch thành Refunded khi đối tác xác nhận | Cao |
| SRS-PH-REFUND-01-06 | Webhook refund | Gửi webhook thông báo hoàn tiền đến BizOne | Cao |
| SRS-PH-REFUND-01-07 | API refund | API POST `/api/v1/transactions/{id}/refund` | Cao |

#### SRS-PH-REFUND-02: Hoàn tiền một phần

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-REFUND-02-01 | Nhập số tiền | Form nhập số tiền hoàn (<= tổng số tiền gốc) | Cao |
| SRS-PH-REFUND-02-02 | Partial refund | Gửi request partial refund đến đối tác, cập nhật accumulated refund amount | Cao |
| SRS-PH-REFUND-02-03 | Trạng thái động | Refunded nếu đã hoàn hết, vẫn Success nếu còn dư | Cao |
| SRS-PH-REFUND-02-04 | Multiple refund | Mỗi giao dịch có thể hoàn tiền nhiều lần (tổng không vượt quá số tiền gốc) | Cao |
| SRS-PH-REFUND-02-05 | History hiển thị | Hiển thị tổng số tiền đã hoàn so với số tiền gốc, lịch sử các lần hoàn | Trung bình |

### 4.4. Module Webhook / Callback

#### SRS-PH-WEBHOOK-01: Quản lý Webhook

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-WEBHOOK-01-01 | Danh sách webhook | Hiển thị danh sách webhook endpoints đã cấu hình | Cao |
| SRS-PH-WEBHOOK-01-02 | Thêm endpoint | Thêm endpoint mới: URL, secret key, chọn sự kiện (payment.success, payment.failed, refund.completed) | Cao |
| SRS-PH-WEBHOOK-01-03 | Sửa/Xóa | Cho phép sửa URL, vô hiệu hóa tạm thời, xóa endpoint | Cao |
| SRS-PH-WEBHOOK-01-04 | Test ping | Gửi webhook test (ping) để kiểm tra kết nối | Trung bình |
| SRS-PH-WEBHOOK-01-05 | Định dạng | HTTP POST với JSON body, chữ ký HMAC-SHA256 trong header `X-Signature` | Cao |
| SRS-PH-WEBHOOK-01-06 | Retry tự động | Retry tối đa 5 lần với exponential backoff (1ph, 5ph, 15ph, 1h, 6h) | Cao |
| SRS-PH-WEBHOOK-01-07 | Dashboard webhook | Dashboard theo dõi: số lần gửi, thành công, thất bại, thời gian phản hồi | Trung bình |
| SRS-PH-WEBHOOK-01-08 | Replay thủ công | Cho phép gửi lại (replay) webhook thủ công | Trung bình |

#### SRS-PH-WEBHOOK-02: Lịch sử Webhook

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-WEBHOOK-02-01 | Danh sách lịch sử | Hiển thị danh sách webhook đã gửi (thời gian, endpoint, nội dung, HTTP status, thành công/thất bại) | Cao |
| SRS-PH-WEBHOOK-02-02 | Chi tiết raw | Xem chi tiết request/response raw | Cao |
| SRS-PH-WEBHOOK-02-03 | Replay | Gửi lại webhook bất kỳ từ lịch sử | Cao |
| SRS-PH-WEBHOOK-02-04 | Bộ lọc | Lọc theo thời gian, trạng thái (success/failed), endpoint | Trung bình |

### 4.5. Module Đối soát & Tra soát

#### SRS-PH-RECON-01: Đối soát giao dịch tự động

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-RECON-01-01 | Scheduled job | Tự động chạy đối soát định kỳ hàng ngày (00:00) | Cao |
| SRS-PH-RECON-01-02 | Lấy báo cáo đối tác | Lấy báo cáo giao dịch từ đối tác (qua API hoặc file CSV/Excel) | Cao |
| SRS-PH-RECON-01-03 | So khớp | So khớp giao dịch Payment Hub với đối tác: khớp (tồn tại cả 2 bên, đúng số tiền), lệch (chỉ có 1 bên, sai số tiền) | Cao |
| SRS-PH-RECON-01-04 | Báo cáo đối soát | Tạo báo cáo: tổng GD Payment Hub, tổng GD đối tác, tổng tiền mỗi bên, danh sách GD khớp, danh sách GD lệch, danh sách GD sai số tiền | Cao |
| SRS-PH-RECON-01-05 | Cảnh báo lệch | Gửi thông báo nếu có chênh lệch | Cao |
| SRS-PH-RECON-01-06 | Định dạng | Hỗ trợ nhiều định dạng đối soát (API, CSV, Excel) | Trung bình |
| SRS-PH-RECON-01-07 | Xuất báo cáo | Xuất báo cáo đối soát ra Excel/PDF | Trung bình |
| SRS-PH-RECON-01-08 | Lịch sử | Lưu lịch sử đối soát theo ngày | Trung bình |
| SRS-PH-RECON-01-09 | Hiệu năng | Đối soát 10,000 giao dịch trong < 5 phút | Cao |

#### SRS-PH-RECON-02: Tra soát giao dịch

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-RECON-02-01 | UI tra soát | Nút "Tra soát" trong chi tiết giao dịch (khi trạng thái lỗi) | Cao |
| SRS-PH-RECON-02-02 | Nhập nội dung | Form nhập nội dung tra soát, lý do (bắt buộc) | Cao |
| SRS-PH-RECON-02-03 | Ghi nhận | Hệ thống ghi nhận yêu cầu tra soát với trạng thái "Đang xử lý" | Cao |
| SRS-PH-RECON-02-04 | Tự động gửi đối tác | (Tùy chọn) Tự động gửi yêu cầu tra soát đến đối tác nếu có API | Trung bình |
| SRS-PH-RECON-02-05 | Theo dõi trạng thái | Theo dõi trạng thái tra soát (Đang xử lý / Đã giải quyết) | Cao |
| SRS-PH-RECON-02-06 | Multiple requests | Mỗi giao dịch có thể có nhiều yêu cầu tra soát | Trung bình |
| SRS-PH-RECON-02-07 | Đính kèm file | Cho phép đính kèm file (chứng từ, hình ảnh) | Trung bình |
| SRS-PH-RECON-02-08 | Thông báo | Gửi thông báo khi có kết quả tra soát | Trung bình |

### 4.6. Module Dashboard & Báo cáo

#### SRS-PH-DASH-01: Dashboard tổng quan thanh toán

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-DASH-01-01 | Top bar | Hiển thị real-time: tổng GD hôm nay, tổng số tiền, số GD thành công, số GD thất bại | Cao |
| SRS-PH-DASH-01-02 | Biểu đồ 7 ngày | Biểu đồ line/bar giao dịch 7 ngày (số lượng GD và tổng tiền) | Cao |
| SRS-PH-DASH-01-03 | Biểu đồ tròn | Biểu đồ tròn phương thức thanh toán (VNPay, MoMo, ZaloPay, QR...) | Cao |
| SRS-PH-DASH-01-04 | Tỷ lệ thành công | Biểu đồ tỷ lệ thành công/thất bại | Cao |
| SRS-PH-DASH-01-05 | GD gần đây | Danh sách 10 giao dịch gần nhất | Cao |
| SRS-PH-DASH-01-06 | Top merchant | Top merchant có doanh số cao nhất | Trung bình |
| SRS-PH-DASH-01-07 | Cảnh báo | Cảnh báo giao dịch lỗi nhiều bất thường, webhook thất bại nhiều | Cao |
| SRS-PH-DASH-01-08 | Real-time | Cập nhật real-time qua WebSocket | Cao |
| SRS-PH-DASH-01-09 | Khoảng thời gian | Cho phép chọn khoảng thời gian (Hôm nay, 7 ngày, 30 ngày) | Trung bình |
| SRS-PH-DASH-01-10 | Hiệu năng | Dashboard load trong < 3 giây | Cao |

#### SRS-PH-RPT-01: Báo cáo giao dịch

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-RPT-01-01 | Bộ lọc | Lọc theo thời gian, trạng thái, đối tác, phương thức, merchant | Cao |
| SRS-PH-RPT-01-02 | Thông số | Hiển thị tổng số GD, tổng số tiền, phí giao dịch, số GD thành công/thất bại | Cao |
| SRS-PH-RPT-01-03 | Biểu đồ | Biểu đồ theo ngày | Trung bình |
| SRS-PH-RPT-01-04 | Xuất báo cáo | Xuất Excel/PDF/CSV | Cao |

#### SRS-PH-RPT-02: Báo cáo doanh thu

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-RPT-02-01 | Doanh thu theo đối tác | Doanh thu theo từng đối tác thanh toán | Cao |
| SRS-PH-RPT-02-02 | Doanh thu theo phương thức | Doanh thu theo từng phương thức | Cao |
| SRS-PH-RPT-02-03 | So sánh cùng kỳ | So sánh doanh thu cùng kỳ | Trung bình |
| SRS-PH-RPT-02-04 | Biểu đồ tăng trưởng | Biểu đồ tăng trưởng doanh thu | Trung bình |
| SRS-PH-RPT-02-05 | Phí giao dịch | Chi tiết phí giao dịch (nếu applicable) | Trung bình |
| SRS-PH-RPT-02-06 | Xuất báo cáo | Xuất Excel/PDF | Trung bình |

#### SRS-PH-RPT-03: Báo cáo đối soát

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-RPT-03-01 | Kết quả đối soát | Hiển thị kết quả đối soát theo ngày | Cao |
| SRS-PH-RPT-03-02 | Tổng hợp | Tổng GD khớp, tổng GD lệch, tổng chênh lệch tiền | Cao |
| SRS-PH-RPT-03-03 | Chi tiết lệch | Chi tiết từng giao dịch lệch kèm trạng thái xử lý | Cao |
| SRS-PH-RPT-03-04 | Xuất báo cáo | Xuất báo cáo đối soát ra Excel | Trung bình |

### 4.7. Module Audit Log & Bảo mật

#### SRS-PH-AUDIT-01: Nhật ký giao dịch (Transaction Log)

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-AUDIT-01-01 | Sự kiện log | Ghi log các sự kiện: tạo GD, thay đổi trạng thái, request/response API đối tác, nhận IPN, gửi webhook, hoàn tiền, tra soát | Cao |
| SRS-PH-AUDIT-01-02 | Nội dung log | Mỗi log ghi: thời gian, sự kiện, dữ liệu request/response, kết quả | Cao |
| SRS-PH-AUDIT-01-03 | Append-only | Log không thể xóa hoặc chỉnh sửa (append-only) | Cao |
| SRS-PH-AUDIT-01-04 | Thời gian lưu trữ | Lưu tối thiểu 90 ngày, có thể cấu hình thời gian lưu lâu hơn | Trung bình |

#### SRS-PH-AUDIT-02: Audit Log hệ thống

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-AUDIT-02-01 | Thao tác quản trị | Ghi log: thay đổi cấu hình đối tác, thêm/sửa Connector, thay đổi cấu hình webhook, đăng nhập/đăng xuất, hoàn tiền thủ công | Cao |
| SRS-PH-AUDIT-02-02 | Nội dung audit | Mỗi log ghi: thời gian, người thực hiện, IP, nội dung, dữ liệu cũ/mới | Cao |
| SRS-PH-AUDIT-02-03 | Thời gian lưu trữ | Lưu tối thiểu 90 ngày | Trung bình |

---

## 5. Yêu cầu phi chức năng

### 5.1. Hiệu năng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-01 | Thời gian tạo giao dịch | < 500ms |
| SRS-PH-NFR-02 | Thời gian sinh QR | < 1 giây |
| SRS-PH-NFR-03 | Xử lý IPN/Webhook từ đối tác | < 2 giây (từ nhận đến cập nhật trạng thái) |
| SRS-PH-NFR-04 | Gửi webhook đến BizOne | < 3 giây (từ cập nhật trạng thái đến lúc gửi) |
| SRS-PH-NFR-05 | Dashboard load | < 3 giây |
| SRS-PH-NFR-06 | Tra cứu giao dịch | < 2 giây |
| SRS-PH-NFR-07 | Đối soát 10,000 giao dịch | < 5 phút |

### 5.2. Bảo mật

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-08 | Xác thực API | HMAC-SHA256 signature |
| SRS-PH-NFR-09 | Mã hóa truyền tải | TLS 1.2+ |
| SRS-PH-NFR-10 | Mã hóa dữ liệu nhạy cảm | API Key, Secret Key được mã hóa trong database (AES-256) hoặc lưu trong Vault/KMS |
| SRS-PH-NFR-11 | Secret Management | Secret/API Key của Connector lưu trong Vault/KMS, không lưu trong code, config file, hoặc log |
| SRS-PH-NFR-12 | IP whitelist | Cho phép giới hạn IP gọi API |
| SRS-PH-NFR-13 | Rate limiting | 100 req/min cho mỗi API key |
| SRS-PH-NFR-14 | Audit Log | Append-only, không thể xóa/sửa |
| SRS-PH-NFR-15 | No sensitive logging | Không ghi log dữ liệu nhạy cảm (PAN, CVV, API Key, Secret Key) trong toàn bộ hệ thống |

### 5.3. Tính sẵn sàng & Độ tin cậy

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-16 | Uptime | 99.9% |
| SRS-PH-NFR-17 | Xử lý thất bại | Retry tự động với exponential backoff |
| SRS-PH-NFR-18 | Webhook retry | Tối đa 5 lần (1ph, 5ph, 15ph, 1h, 6h) |
| SRS-PH-NFR-19 | Graceful degradation | Một đối tác lỗi không ảnh hưởng đối tác khác (fault isolation) |
| SRS-PH-NFR-20 | Circuit Breaker | Tự động ngắt kết nối Connector khi error/timeout vượt ngưỡng, auto-recovery |
| SRS-PH-NFR-21 | Backup | Tự động backup database hàng ngày |

### 5.4. Khả năng mở rộng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-22 | Kiến trúc Connector plugin | Thêm PSP mới mà không sửa core, hỗ trợ hot-plug |
| SRS-PH-NFR-23 | Zero-core-change | Tích hợp PSP mới hoàn toàn không cần thay đổi mã nguồn Core Payment Hub |
| SRS-PH-NFR-24 | Horizontal scaling | Hỗ trợ triển khai nhiều instance |
| SRS-PH-NFR-25 | Async processing | Xử lý bất đồng bộ cho tác vụ nặng (đối soát, gửi webhook) |
| SRS-PH-NFR-26 | Multi-protocol | Connector hỗ trợ đa giao thức (REST, SOAP, MQ, SFTP, OpenAPI, Proprietary API) |

### 5.6. Giao diện & Trải nghiệm người dùng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-27 | Responsive | Desktop (> 1024px) tối ưu cho quản trị |
| SRS-PH-NFR-28 | Real-time | Trạng thái giao dịch, số liệu dashboard cập nhật real-time |
| SRS-PH-NFR-29 | Debug-friendly | Cho phép xem dữ liệu raw request/response từ đối tác |
| SRS-PH-NFR-30 | Bảng màu | Primary: #2563EB, Success: #10B981, Warning: #F59E0B, Error: #EF4444, Info: #3B82F6 |
| SRS-PH-NFR-31 | Font | Inter (Web), SF Pro (macOS); 14px body, 16px heading, 20px+ số tiền dashboard |

### 5.7. Monitoring & Observability

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-PH-NFR-32 | Connector metrics | Thu thập metrics riêng cho từng Connector: TPS, Latency, Success Rate, Failure Rate, Timeout Rate, Refund Success Rate |
| SRS-PH-NFR-33 | Health check | Tự động health check định kỳ cho mọi Connector, cập nhật trạng thái real-time |
| SRS-PH-NFR-34 | Connector alerts | Cảnh báo tự động khi Connector down, high error rate > 10%, high latency > 10 giây, webhook failure |
| SRS-PH-NFR-35 | Connector logs | Thu thập và lưu trữ request log, response log, callback log, audit log riêng cho từng Connector |

---

## 6. Yêu cầu dữ liệu

### 6.1. Dữ liệu đầu vào

| Module | Dữ liệu nhập | Định dạng | Validation |
|--------|-------------|-----------|------------|
| Tạo giao dịch | Merchant ID, số tiền, mô tả, return URL, webhook URL | JSON | Số tiền > 0, URL hợp lệ |
| Cấu hình đối tác | API Key, Secret Key, Endpoint, Merchant Code | Text | Kiểm tra kết nối trước khi lưu |
| Hoàn tiền | Transaction ID, số tiền, lý do | JSON | Số tiền <= số tiền GD gốc |
| Webhook | URL, Secret, Events | Text, Array | URL hợp lệ, test ping |
| QR sinh | Transaction ID, kích thước, loại QR | JSON | Transaction tồn tại |

### 6.2. Dữ liệu đầu ra

| Module | Dữ liệu xuất | Định dạng |
|--------|-------------|-----------|
| Danh sách giao dịch | Báo cáo giao dịch | Excel, CSV |
| Báo cáo doanh thu | Doanh thu theo đối tác/phương thức | Excel, PDF |
| Báo cáo đối soát | Kết quả đối soát | Excel, PDF |
| QR Code | Hình ảnh QR Code | Base64, PNG, SVG |

### 6.3. Entities chính

**Transaction:**

```
{
  id: string (UUID)
  merchant_txn_id: string (unique per merchant)
  merchant_id: string
  amount: decimal(15,0)
  currency: string (default: VND)
  description: string
  status: enum(Created, Pending, Success, Failed, Expired, Refunded, PartiallyRefunded)
  payment_method: string
  partner: string
  partner_txn_id: string
  return_url: string
  webhook_url: string
  customer: { name, email, phone }
  metadata: json
  refunded_amount: decimal(15,0)
  expired_at: datetime
  created_at: datetime
  updated_at: datetime
  paid_at: datetime
}
```

**Partner Config:**

```
{
  id: string (UUID)
  connector_type: string (VNPay, MoMo, ZaloPay, ...)
  name: string
  api_key: string (encrypted)
  secret_key: string (encrypted)
  merchant_code: string
  endpoint_sandbox: string
  endpoint_production: string
  callback_url: string
  webhook_url: string
  timeout: integer
  retry_policy: json
  status: enum(Active, Inactive, Error)
  environment: enum(Sandbox, Production)
}
```

**Webhook Config:**

```
{
  id: string (UUID)
  url: string
  secret: string
  events: array(string)
  status: enum(Active, Inactive)
  retry_count: integer
  created_at: datetime
}
```

**Connector Registry Entry:**

```
{
  id: string (UUID)
  name: string
  connector_type: string (VNPay, MoMo, ZaloPay, ...)
  version: string (semver)
  status: enum(Registered, Active, Inactive, Error, Maintenance)
  config_schema: json (dynamic schema do Connector định nghĩa)
  supported_methods: array(string)
  supported_protocols: array(string)
  core_compatibility: string (phiên bản Core tương thích)
  health: { status, last_check, latency, uptime }
  deployed_at: datetime
  activated_at: datetime
  updated_at: datetime
}
```

**Connector Metrics Snapshot:**

```
{
  connector_id: string
  timestamp: datetime
  tps: float
  latency_avg: integer (ms)
  latency_p95: integer (ms)
  latency_p99: integer (ms)
  success_rate: float
  failure_rate: float
  timeout_rate: float
  refund_success_rate: float
  total_requests: integer
  total_failures: integer
  total_timeouts: integer
}
```

### 6.4. Lưu trữ dữ liệu

- Giao dịch thanh toán: lưu vĩnh viễn
- Log request/response API: tối thiểu 90 ngày
- Audit log: tối thiểu 90 ngày
- QR Code tạm: xóa sau khi hết hạn hoặc giao dịch hoàn tất

---

## 7. Yêu cầu giao diện

### 7.1. Cấu trúc giao diện tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Payment Hub Logo  │  Search  │  Notif  │  Profile │
├──────────────────┬──────────────────────────────────────────┤
│  Sidebar         │  Main Content Area                        │
│  ┌────────────┐  │  ┌──────────────────────────────────────┐ │
│  │ Dashboard  │  │  │                                      │ │
│  │ Giao dịch  │  │  │   Content (thay đổi theo module)    │ │
│  │ Đối tác    │  │  │                                      │ │
│  │ Connector  │  │  │                                      │ │
│  │ Webhook    │  │  │                                      │ │
│  │ Đối soát   │  │  │                                      │ │
│  │ Báo cáo    │  │  └──────────────────────────────────────┘ │
│  │ Audit Log  │  │                                           │
│  │ Cài đặt    │  │                                           │
│  └────────────┘  │                                           │
└──────────────────┴───────────────────────────────────────────┘
```

### 7.2. Màn hình chi tiết giao dịch

```
┌─────────────────────────────────────────────────────────────┐
│  ◀ Back to Transactions                                     │
│                                                             │
│  MÃ GIAO DỊCH: TXN-20260612-XXXXXX                          │
│  Trạng thái: ● Success                    [Hoàn tiền]       │
│                                                             │
│  ┌─────────────────┬─────────────────────────────────────┐  │
│  │ Thông tin       │ Thông tin thanh toán                 │  │
│  │ Số tiền:        │ Phương thức: Quét QR                 │  │
│  │   1,500,000 VND │ Đối tác: VNPay                       │  │
│  │ Mô tả:          │ Thời gian: 12/06/2026 14:30:22      │  │
│  │   Thanh toán    │ Mã GD đối tác: 1234567890           │  │
│  │   đơn hàng #123 │                                      │  │
│  ├─────────────────┴─────────────────────────────────────┤  │
│  │ Thông tin khách hàng                                    │  │
│  │ Tên: Nguyễn Văn A  |  Email: a@example.com            │  │
│  │ SĐT: 0901234567                                        │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Log giao dịch                                           │  │
│  │ [14:30:22] Payment Success - VNPay confirmed           │  │
│  │ [14:30:20] Redirect from VNPay                         │  │
│  │ [14:29:50] Customer redirected to VNPay               │  │
│  │ [14:29:45] Transaction Created                         │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Dữ liệu raw (Request/Response từ đối tác)              │  │
│  │ [Xem JSON] [Copy]                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 7.3. Danh sách màn hình chính

| STT | Màn hình | Module | Vai trò truy cập |
|-----|----------|--------|------------------|
| 1 | Dashboard tổng quan | Dashboard | Admin, Owner, Operations |
| 2 | Danh sách giao dịch | Giao dịch | Admin, Operations |
| 3 | Chi tiết giao dịch | Giao dịch | Admin, Operations |
| 4 | Danh sách đối tác | Đối tác | Admin |
| 5 | Cấu hình đối tác | Đối tác | Admin |
| 6 | Danh sách Connector | Connector | Admin |
| 7 | Cấu hình Connector | Connector | Admin |
| 8 | Danh sách Webhook | Webhook | Admin, Developer |
| 9 | Chi tiết Webhook | Webhook | Admin, Developer |
| 10 | Lịch sử Webhook | Webhook | Admin, Operations |
| 11 | Báo cáo giao dịch | Báo cáo | Admin, Owner, Operations |
| 12 | Báo cáo doanh thu | Báo cáo | Admin, Owner |
| 13 | Báo cáo đối soát | Báo cáo | Admin, Operations |
| 14 | Hoàn tiền (form) | Refund | Admin, Operations |
| 15 | Tra soát (form) | Tra soát | Admin, Operations |
| 16 | Audit Log | Audit | Admin |

---

## 8. Yêu cầu tích hợp & API

### 8.1. API thanh toán (dành cho BizOne / bên thứ ba)

| Endpoint | Mô tả | Phương thức | Auth |
|----------|-------|-------------|------|
| `/api/v1/transactions` | Tạo giao dịch thanh toán mới | POST | API Key + HMAC |
| `/api/v1/transactions/{id}` | Tra cứu giao dịch theo ID | GET | API Key + HMAC |
| `/api/v1/transactions/merchant/{merchant_txn_id}` | Tra cứu theo mã GD merchant | GET | API Key + HMAC |
| `/api/v1/transactions/{id}/refund` | Yêu cầu hoàn tiền | POST | API Key + HMAC |
| `/api/v1/qr/generate` | Sinh QR thanh toán | POST | API Key + HMAC |
| `/api/v1/partners` | Danh sách đối tác hỗ trợ | GET | API Key + HMAC |
| `/api/v1/webhook-test` | Gửi webhook test đến BizOne | POST | API Key + HMAC |

**Yêu cầu bảo mật API:**
- Xác thực qua API Key + Secret với HMAC-SHA256 signature trong header `X-Signature`
- Rate limiting: 100 req/min cho mỗi API key
- IP whitelist (tùy chọn)
- Request/Response đều được log
- Idempotency key trong header `Idempotency-Key`

### 8.2. Webhook từ Payment Hub đến BizOne

| Sự kiện | Mô tả | Gửi khi nào |
|---------|-------|-------------|
| `payment.success` | Thanh toán thành công | Khi đối tác xác nhận GD thành công |
| `payment.failed` | Thanh toán thất bại | Khi đối tác báo GD thất bại |
| `payment.expired` | Giao dịch hết hạn | Khi GD hết hạn chờ thanh toán |
| `refund.completed` | Hoàn tiền hoàn tất | Khi đối tác xác nhận hoàn tiền |

**Payload mẫu (payment.success):**
```json
{
  "event": "payment.success",
  "transaction_id": "TXN-20260612-XXXXXX",
  "merchant_txn_id": "ORDER-123",
  "amount": 1500000,
  "currency": "VND",
  "partner": "VNPay",
  "partner_txn_id": "1234567890",
  "paid_at": "2026-06-12T14:30:22+07:00",
  "signature": "hmac_sha256_signature"
}
```

### 8.3. Tích hợp đối tác thanh toán

| Đối tác | Phương thức tích hợp | Đặc thù | Giai đoạn |
|---------|---------------------|---------|-----------|
| **VNPay** | API + IPN + Redirect | Cổng thanh toán online, hỗ trợ QR, ATM, Visa/Master | MVP |
| **VietQR** | Chuẩn EMVCo - VietQR | Sinh QR theo chuẩn Napas, khách hàng quét bằng app ngân hàng | MVP |
| **MoMo** | API + Webhook | Ví điện tử, MoMo QR | GĐ 2 |
| **ZaloPay** | API + Callback | Ví điện tử, ZaloPay QR | GĐ 2 |
| **Napas QR** | Chuẩn Napas | Tương tự VietQR, hỗ trợ tất cả ngân hàng | GĐ 2 |

---

## 9. Yêu cầu thông báo

### 9.1. Các loại thông báo

| Loại | Kênh | Đối tượng | Nội dung |
|------|------|-----------|----------|
| Giao dịch thành công | Hệ thống (real-time) | BizOne | "Thanh toán 1,500,000₫ thành công - Mã GD: TXN-XXX" |
| Giao dịch thất bại | Hệ thống (real-time) | BizOne | "Thanh toán 1,500,000₫ thất bại - Lỗi từ VNPay" |
| Webhook thất bại | Hệ thống + Email | Admin | "Webhook đến BizOne thất bại sau 5 lần retry" |
| Đối soát chênh lệch | Hệ thống + Email | Admin, Operations | "Đối soát ngày 12/06: 3 GD lệch, tổng 1,200,000₫" |
| Hoàn tiền hoàn tất | Hệ thống | Operations | "Hoàn tiền 500,000₫ cho GD TXN-XXX thành công" |
| Kết nối đối tác lỗi | Hệ thống + Email | Admin | "Kết nối VNPay thất bại: timeout" |
| Giao dịch đáng ngờ | Hệ thống | Admin | "Phát hiện 10 GD thất bại liên tiếp từ cùng IP" |

### 9.2. Yêu cầu kỹ thuật thông báo

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PH-NOTIF-01 | Real-time | Thông báo real-time qua WebSocket, hiển thị trong notification center | Cao |
| SRS-PH-NOTIF-02 | Email | Gửi email qua SMTP, hỗ trợ template | Trung bình |
| SRS-PH-NOTIF-03 | Lịch sử | Notification Center lưu lịch sử 30 ngày, đánh dấu đã đọc/chưa đọc | Trung bình |
| SRS-PH-NOTIF-04 | Ngưỡng cảnh báo | Cho phép cấu hình ngưỡng cảnh báo (ví dụ: chỉ gửi email khi webhook thất bại > 3 lần) | Trung bình |

---

## 10. Tiêu chí chấp nhận

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-PH-TXN-01 | Tạo GD | Tạo giao dịch thành công trong < 500ms |
| AC-PH-TXN-02 | Xử lý IPN | Nhận và xử lý IPN từ đối tác trong < 2 giây |
| AC-PH-TXN-03 | QR sinh | Sinh QR Code trong < 1 giây |
| AC-PH-TXN-04 | Webhook gửi | Webhook gửi đến BizOne trong < 3 giây |
| AC-PH-TXN-05 | Webhook retry | Retry tối đa 5 lần khi thất bại, đúng exponential backoff |
| AC-PH-REF-01 | Hoàn tiền | Hoàn tiền toàn phần/một phần thành công |
| AC-PH-REF-02 | Partial Refund | Cho phép hoàn tiền nhiều lần, tổng không vượt quá số tiền gốc |
| AC-PH-RECON-01 | Đối soát | Đối soát 10,000 GD trong < 5 phút |
| AC-PH-RECON-02 | Phát hiện lệch | Phát hiện chính xác GD lệch giữa 2 bên |
| AC-PH-DASH-01 | Dashboard load | Dashboard tải trong < 3 giây |
| AC-PH-DASH-02 | Real-time | Dashboard cập nhật dữ liệu cách đây tối đa 30 giây |
| AC-PH-SEC-01 | Xác thực API | Request không có signature hợp lệ bị từ chối |
| AC-PH-SEC-02 | Audit Log | Mọi thay đổi trạng thái GD đều được ghi log |
| AC-PH-PARTNER-01 | Connector mới | Thêm Connector mới không yêu cầu restart system |
| AC-PH-PARTNER-02 | Isolation | Một đối tác lỗi không ảnh hưởng đối tác khác |
| AC-PH-PARTNER-03 | Interface Contract | Connector mới implement đúng interface chuẩn được Registry chấp nhận |
| AC-PH-PARTNER-04 | Hot-Plug | Activate/deactivate Connector mà không downtime, routing cập nhật trong < 5 giây |
| AC-PH-PARTNER-05 | Circuit Breaker | Tự động ngắt Connector khi timeout > 5 lần liên tiếp trong 1 phút |
| AC-PH-PARTNER-06 | Connector Metrics | Metrics của từng Connector được thu thập và hiển thị trong < 10 giây |
| AC-PH-PARTNER-07 | PSP Onboarding | Quy trình thêm PSP mới hoàn tất mà không sửa Core |
| AC-PH-NFR-01 | Uptime | Hệ thống đạt 99.9% uptime |

---

## 11. Kế hoạch phát triển

### Giai đoạn 1: MVP

| Module | Tính năng |
|--------|-----------|
| Core | Tạo giao dịch, quản lý trạng thái (Created → Success/Failed/Expired) |
| VNPay | Tích hợp VNPay: tạo GD, nhận IPN, xử lý kết quả |
| VietQR | Sinh QR theo chuẩn VietQR |
| Webhook | Gửi webhook đến BizOne, retry cơ bản |
| Dashboard | Dashboard cơ bản: số GD, tổng tiền, tỷ lệ thành công |

### Giai đoạn 2: Connector Framework & Mở rộng

| Module | Tính năng |
|--------|-----------|
| Connector Core | Connector Registry, Connector Manager, Route Engine, Health Monitor |
| Interface Contract | Chuẩn hóa PaymentConnector Interface, Core DTO, Mapping Layer |
| Hot-Plug | Cơ chế hot-plug: register/activate/deactivate/remove Connector không downtime |
| Isolation | Fault isolation: circuit breaker, timeout isolation, resource isolation |
| Security Contract | TLS 1.2+, HMAC signature, Vault/KMS integration, no sensitive logging |
| MoMo | Tích hợp MoMo QR qua Connector plugin |
| ZaloPay | Tích hợp ZaloPay qua Connector plugin |
| Refund | Hoàn tiền toàn phần/một phần qua VNPay, MoMo |
| Đối soát | Đối soát tự động với VNPay, MoMo |
| Báo cáo | Báo cáo giao dịch, doanh thu, đối soát |

### Giai đoạn 3: Tối ưu

| Module | Tính năng |
|--------|-----------|
| Connector Versioning | Semantic versioning, zero-downtime upgrade, backward compatibility |
| Connector Monitoring | Metrics dashboard real-time, alerting, logging cho từng Connector |
| Tra soát | Công cụ tra soát giao dịch, tự động gửi yêu cầu đến đối tác |
| Audit Log | Audit Log đầy đủ cho toàn bộ hệ thống |
| Notification | Thông báo real-time, email cảnh báo |
| Performance | Tối ưu hiệu năng, hỗ trợ scale ngang |
| Multi-protocol | Hỗ trợ SOAP, MQ, SFTP, OpenAPI ngoài REST |

---

## 12. Phụ lục

### Bảng thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| Payment Hub | Hệ thống trung gian xử lý thanh toán tập trung |
| IPN | Instant Payment Notification - Thông báo thanh toán tức thời từ đối tác |
| Webhook | Callback HTTP được gửi khi có sự kiện |
| VietQR | Chuẩn QR Code thanh toán liên ngân hàng tại Việt Nam |
| Napas QR | Chuẩn QR Code của Napas (National Payment Corporation of Vietnam) |
| Connector | Module plugin kết nối với đối tác thanh toán |
| PSP | Payment Service Provider - Nhà cung cấp dịch vụ thanh toán |
| Connector Registry | Thành phần quản lý danh sách Connector đã đăng ký |
| Connector Manager | Service quản lý vòng đời Connector |
| Mapping Layer | Lớp chuyển đổi dữ liệu Core DTO ↔ PSP Format |
| DTO | Data Transfer Object - Đối tượng dữ liệu chuẩn |
| Vault/KMS | Hệ thống lưu trữ secret tập trung |
| Hot-Plug | Khả năng thêm/bật/tắt Connector không restart |
| Circuit Breaker | Cơ chế ngắt kết nối tự động khi lỗi vượt ngưỡng |
| HMAC | Hash-based Message Authentication Code |
| Refund | Hoàn tiền cho giao dịch đã thanh toán |
| Reconciliation | Đối soát giao dịch giữa các hệ thống |
| Merchant | Đơn vị chấp nhận thanh toán |
| Exponential Backoff | Chiến lược retry với thời gian tăng dần |
| Idempotency | Tính chất đảm bảo request chỉ xử lý một lần |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*

*Version history:*
| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 12/06/2026 | 1.0 | | Tạo mới dựa trên URD-PaymentHub.md |
| 12/06/2026 | 1.1 | | Bổ sung Connector Plugin Architecture: Interface Contract, DTO, Registry, Hot-Plug, Isolation, Security Contract, Versioning, Monitoring, PSP Onboarding quy trình |
