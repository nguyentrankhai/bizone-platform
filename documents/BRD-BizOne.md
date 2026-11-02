# BRD - Business Requirements Document

## Phần mềm Quản lý Bán hàng BizOne

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne - Omni Channel POS & Management Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 11/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Tổng quan dự án

### 1.1. Giới thiệu

BizOne là nền tảng quản lý bán hàng All-In-One dành cho các cửa hàng SME (Small & Medium Enterprises), hoạt động trên nền tảng web sử dụng **NextJS** và cơ sở dữ liệu **MariaDB**. Hệ thống hỗ trợ mô hình bán hàng **Omni Channel**, cho phép đồng bộ tồn kho, đơn hàng và dữ liệu khách hàng trên tất cả các kênh bán.

### 1.2. Tầm nhìn

Trở thành hệ điều hành bán hàng số một cho các cửa hàng SME tại Việt Nam, giúp chủ cửa hàng vận hành toàn bộ hoạt động kinh doanh trên một nền tảng duy nhất.

### 1.3. Sứ mệnh

Đơn giản hóa và tự động hóa quy trình bán hàng, quản lý kho, CRM, báo cáo và marketing cho các cửa hàng vừa và nhỏ, giúp họ tiết kiệm chi phí vận hành và tăng doanh thu.

---

## 2. Mục tiêu kinh doanh

| STT | Mục tiêu | Mô tả | KPI |
|-----|----------|-------|-----|
| 1 | Tăng tốc độ xử lý bán hàng | Giảm thời gian tạo hóa đơn xuống dưới 10 giây/giao dịch | Thời gian trung bình tạo hóa đơn |
| 2 | Đồng bộ đa kênh | Tồn kho và đơn hàng đồng bộ thời gian thực trên tất cả kênh | Sai lệch tồn kho < 0.1% |
| 3 | Tăng hiệu quả quản lý | Giảm 50% thời gian nhập liệu và báo cáo thủ công | Số giờ quản lý/tuần |
| 4 | Cải thiện trải nghiệm khách hàng | Hỗ trợ đa phương thức thanh toán và hiển thị thông tin trên 2 màn hình POS | Điểm hài lòng khách hàng |
| 5 | Mở rộng thị trường | Hỗ trợ bán hàng trên website, sàn TMĐT và mạng xã hội | Số lượng kênh bán hàng |

---

## 3. Phạm vi dự án

### 3.1. Trong phạm vi (In Scope)

- Hệ thống POS bán hàng với 2 màn hình (nhân viên + khách hàng)
- Quản lý sản phẩm, kho hàng, đơn hàng
- CRM & quản lý khách hàng thân thiết
- Quản lý nhân viên, ca làm việc, hoa hồng
- Báo cáo & phân tích doanh số
- Kết nối bán hàng đa kênh (Omni Channel)
- Quản lý nhà cung cấp & nhập hàng
- Marketing & khuyến mãi
- Kế toán & tài chính cơ bản
- Ứng dụng di động (PWA / Mobile Web) cho chủ cửa hàng

### 3.2. Ngoài phạm vi (Out of Scope)

- Tích hợp sâu với phần mềm kế toán chuyên dụng (sẽ phát triển ở giai đoạn 2)
- Chatbot AI bán hàng tự động (sẽ phát triển ở giai đoạn 3)
- Dự báo nhu cầu nhập hàng bằng AI (sẽ phát triển ở giai đoạn 3)
- Ứng dụng native mobile (sử dụng PWA thay thế)

---

## 4. Các bên liên quan

| Bên liên quan | Vai trò | Nhu cầu chính |
|---------------|---------|---------------|
| **Chủ cửa hàng (Owner)** | Người ra quyết định, giám sát tổng thể | Dashboard tổng quan, báo cáo lợi nhuận, kiểm soát nhân viên |
| **Quản lý (Manager)** | Quản lý vận hành hàng ngày | Quản lý sản phẩm, kho, nhân viên, báo cáo chi tiết |
| **Nhân viên bán hàng (Seller)** | Tạo hóa đơn, phục vụ khách | POS nhanh, hỗ trợ thanh toán đa dạng, đổi trả |
| **Khách hàng (Customer)** | Người mua hàng | Thanh toán nhanh, theo dõi đơn hàng, tích điểm |
| **Nhà cung cấp (Supplier)** | Đối tác cung cấp hàng hóa | Quản lý đơn nhập, công nợ |

---

## 5. Vai trò người dùng và phân quyền

| Vai trò | Quyền hạn | Màn hình chính |
|---------|-----------|----------------|
| **Admin (Owner)** | Toàn quyền hệ thống | Dashboard, tất cả module, cấu hình hệ thống |
| **Manager** | Quản lý vận hành (trừ cấu hình hệ thống) | Dashboard, quản lý sản phẩm/kho/nhân viên/báo cáo |
| **Seller (Nhân viên bán hàng)** | POS, tra cứu sản phẩm, khách hàng | POS 2 màn hình |
| **Warehouse Staff** | Quản lý kho, nhập/xuất/kiểm kê | Quản lý kho |
| **Viewer (Chủ cửa hàng đọc-only)** | Xem báo cáo, dashboard | Dashboard, báo cáo |

---

## 6. Yêu cầu chức năng chi tiết

### 6.1. Module Bán hàng (POS)

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| POS-01 | Tạo hóa đơn nhanh | Quét mã vạch hoặc tìm kiếm sản phẩm để tạo hóa đơn | Cao |
| POS-02 | POS 2 màn hình | Màn hình 1 (nhân viên): thao tác chọn sản phẩm, thanh toán. Màn hình 2 (khách hàng): hiển thị danh sách sản phẩm, tổng tiền, khuyến mãi, QR thanh toán | Cao |
| POS-03 | Đa phương thức thanh toán | Tiền mặt, chuyển khoản, thẻ ngân hàng, ví điện tử, QR Code | Cao |
| POS-04 | In hóa đơn / gửi hóa đơn điện tử | Kết nối máy in nhiệt, gửi email/SMS hóa đơn | Cao |
| POS-05 | Tách / gộp hóa đơn | Cho phép tách một hóa đơn thành nhiều hóa đơn nhỏ hoặc gộp nhiều hóa đơn | Trung bình |
| POS-06 | Đổi trả hàng | Xử lý đổi/trả hàng, hoàn tiền | Cao |
| POS-07 | Áp dụng khuyến mãi | Áp dụng voucher, mã giảm giá, khuyến mãi tự động | Cao |
| POS-08 | Tạo đơn đặt hàng trước (pre-order) | Cho phép đặt cọc và tạo đơn giao sau | Thấp |

### 6.2. Module Quản lý Sản phẩm

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| PROD-01 | Danh mục hàng hóa | Quản lý cây danh mục (category tree) | Cao |
| PROD-02 | SKU & Mã vạch | Tạo và quản lý mã SKU, mã vạch cho từng sản phẩm | Cao |
| PROD-03 | Đa đơn vị tính | Hỗ trợ nhiều đơn vị tính (cái/thùng/hộp...) và quy đổi | Cao |
| PROD-04 | Thuộc tính sản phẩm | Màu sắc, kích cỡ, phiên bản | Cao |
| PROD-05 | Combo / Gói sản phẩm | Tạo combo từ nhiều sản phẩm với giá riêng | Trung bình |
| PROD-06 | Giá vốn & Giá bán | Theo dõi giá vốn, giá bán, biên lợi nhuận | Cao |
| PROD-07 | Import/Export sản phẩm | Import/Export danh sách sản phẩm qua file Excel | Trung bình |

### 6.3. Module Quản lý Kho

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| WH-01 | Nhập kho | Tạo phiếu nhập kho từ đơn nhập hàng hoặc nhập trực tiếp | Cao |
| WH-02 | Xuất kho | Xuất kho cho đơn bán, chuyển kho, hủy hàng | Cao |
| WH-03 | Chuyển kho | Chuyển hàng giữa các chi nhánh/cửa hàng | Trung bình |
| WH-04 | Kiểm kê kho | Tạo phiếu kiểm kê, đối chiếu tồn thực tế và hệ thống | Cao |
| WH-05 | Tồn kho thời gian thực | Cập nhật tồn kho ngay sau mỗi giao dịch | Cao |
| WH-06 | Cảnh báo tồn kho | Tự động cảnh báo khi hàng hết hoặc tồn dưới ngưỡng | Cao |
| WH-07 | Quản lý lô & HSD | Theo dõi lô hàng, hạn sử dụng (cho thực phẩm, dược phẩm) | Trung bình |

### 6.4. Module CRM (Quản lý Khách hàng)

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| CRM-01 | Hồ sơ khách hàng | Lưu thông tin liên hệ, địa chỉ, ghi chú | Cao |
| CRM-02 | Lịch sử mua hàng | Xem toàn bộ lịch sử giao dịch của khách hàng | Cao |
| CRM-03 | Phân nhóm khách hàng | Phân loại khách hàng theo nhóm (bán buôn, bán lẻ, VIP...) | Trung bình |
| CRM-04 | Tích điểm thành viên | Tích điểm cho mỗi giao dịch, quy đổi điểm thành tiền | Cao |
| CRM-05 | Xếp hạng khách hàng | Silver, Gold, VIP, Diamond với các đặc quyền khác nhau | Trung bình |
| CRM-06 | Gửi SMS/Email/Zalo Marketing | Gửi thông báo khuyến mãi, chăm sóc khách hàng tự động | Trung bình |
| CRM-07 | Theo dõi công nợ | Quản lý công nợ phải thu của khách hàng | Cao |

### 6.5. Module Quản lý Đơn hàng

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| ORD-01 | Đơn tại cửa hàng | Quản lý đơn bán tại quầy | Cao |
| ORD-02 | Đơn online | Đồng bộ đơn hàng từ website, sàn TMĐT | Cao |
| ORD-03 | Đơn giao hàng | Quản lý đơn giao hàng tận nơi | Cao |
| ORD-04 | Theo dõi trạng thái | Chờ xác nhận → Đang chuẩn bị → Đang giao → Hoàn thành / Hủy | Cao |
| ORD-05 | Quản lý đổi trả | Tạo phiếu đổi/trả, liên kết với hóa đơn gốc | Cao |

### 6.6. Module Quản lý Nhân viên

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| STAFF-01 | Phân quyền | Phân quyền chi tiết theo vai trò | Cao |
| STAFF-02 | Ca làm việc | Tạo và quản lý ca làm việc, xếp lịch | Trung bình |
| STAFF-03 | Chấm công | Check-in/check-out qua hệ thống | Trung bình |
| STAFF-04 | Doanh số nhân viên | Theo dõi doanh số theo từng nhân viên | Cao |
| STAFF-05 | Hoa hồng | Tính hoa hồng tự động theo doanh số hoặc sản phẩm | Trung bình |
| STAFF-06 | Nhật ký thao tác (Audit Log) | Ghi lại toàn bộ thao tác để kiểm soát gian lận | Cao |

### 6.7. Module Báo cáo & Phân tích

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| RPT-01 | Dashboard tổng quan | Biểu đồ doanh thu, lợi nhuận, đơn hàng theo thời gian thực | Cao |
| RPT-02 | Báo cáo doanh thu | Theo ngày/tuần/tháng/năm, so sánh cùng kỳ | Cao |
| RPT-03 | Báo cáo lợi nhuận | Tính lợi nhuận gộp, lợi nhuận ròng | Cao |
| RPT-04 | Hàng bán chạy / bán chậm | Top sản phẩm bán chạy, tồn kho lâu | Cao |
| RPT-05 | Hiệu quả khuyến mãi | Đo lường tác động của các chương trình khuyến mãi | Trung bình |
| RPT-06 | Hiệu quả nhân viên | So sánh doanh số, năng suất giữa các nhân viên | Trung bình |
| RPT-07 | Báo cáo tồn kho | Giá trị tồn kho, hàng sắp hết, hàng quá hạn | Cao |
| RPT-08 | Xuất báo cáo | Xuất PDF, Excel cho tất cả các loại báo cáo | Trung bình |

### 6.8. Module Quản lý Nhà cung cấp

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| SUP-01 | Danh sách nhà cung cấp | Quản lý thông tin nhà cung cấp | Cao |
| SUP-02 | Đơn nhập hàng | Tạo đơn nhập hàng, theo dõi trạng thái | Cao |
| SUP-03 | Công nợ nhà cung cấp | Quản lý công nợ phải trả | Trung bình |
| SUP-04 | Lịch sử giao dịch | Lịch sử nhập hàng và thanh toán | Cao |
| SUP-05 | So sánh giá nhập | So sánh giá nhập giữa các nhà cung cấp | Trung bình |

### 6.9. Module Bán hàng Đa kênh (Omni Channel)

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| OMNI-01 | Website bán hàng | Tích hợp website TMĐT do BizOne cung cấp hoặc tích hợp API | Cao |
| OMNI-02 | Kết nối sàn TMĐT | Shopee, Lazada, TikTok Shop - đồng bộ sản phẩm & đơn hàng | Cao |
| OMNI-03 | Kết nối MXH | Facebook, Instagram, Zalo - đăng bán và nhận đơn | Trung bình |
| OMNI-04 | Đồng bộ tồn kho đa kênh | Tồn kho tự động cập nhật trên tất cả kênh khi có giao dịch | Cao |
| OMNI-05 | Đồng bộ đơn hàng | Đơn từ các kênh tự động đồng bộ về hệ thống quản lý tập trung | Cao |

### 6.10. Module Kế toán & Tài chính

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| ACC-01 | Thu chi | Ghi nhận thu/chi hàng ngày | Cao |
| ACC-02 | Quỹ tiền mặt | Quản lý số dư quỹ tiền mặt, đối soát cuối ca | Cao |
| ACC-03 | Công nợ | Theo dõi công nợ phải thu / phải trả | Cao |
| ACC-04 | Xuất báo cáo tài chính | Báo cáo lời lỗ, báo cáo dòng tiền cơ bản | Trung bình |
| ACC-05 | Đối soát thanh toán | Đối soát giữa hóa đơn và thanh toán từ các kênh | Trung bình |

### 6.11. Module Marketing & Khuyến mãi

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| MKT-01 | Mã giảm giá | Tạo và quản lý mã giảm giá theo % hoặc số tiền | Cao |
| MKT-02 | Voucher | Tạo voucher cho khách hàng thân thiết | Trung bình |
| MKT-03 | Flash sale | Thiết lập chương trình flash sale theo khung giờ | Trung bình |
| MKT-04 | Combo khuyến mãi | Tạo combo giá ưu đãi | Trung bình |
| MKT-05 | Mua X tặng Y | Chương trình khuyến mãi mua hàng tặng hàng | Cao |
| MKT-06 | Chiến dịch Marketing | Gửi SMS/Email/Zalo hàng loạt theo chiến dịch | Trung bình |

### 6.12. Module Tính năng Nâng cao (Giai đoạn sau)

| Mã | Chức năng | Mô tả | Ưu tiên |
|----|-----------|-------|---------|
| ADV-01 | Dự báo nhu cầu nhập hàng bằng AI | Phân tích dữ liệu lịch sử để dự báo nhu cầu tồn kho | Thấp |
| ADV-02 | Gợi ý sản phẩm bán kèm | Gợi ý sản phẩm kèm theo dựa trên giỏ hàng hiện tại | Thấp |
| ADV-03 | Phân tích hành vi khách hàng | Phân tích RFM (Recency, Frequency, Monetary) | Thấp |
| ADV-04 | Chatbot bán hàng | Chatbot tự động tư vấn và bán hàng | Thấp |
| ADV-05 | Tự động tạo báo cáo | Gửi báo cáo định kỳ qua email tự động | Trung bình |

---

## 7. Yêu cầu phi chức năng

### 7.1. Kiến trúc & Công nghệ

| Mã | Yêu cầu | Mô tả |
|----|---------|-------|
| NFR-01 | Nền tảng web | Sử dụng NextJS cho frontend & API (App Router) |
| NFR-02 | Cơ sở dữ liệu | MariaDB (Relational Database) |
| NFR-03 | Kiến trúc | Server-Client với REST API / GraphQL |
| NFR-04 | Responsive | Hỗ trợ desktop, tablet, mobile (PWA) |
| NFR-05 | POS 2 màn hình | Hỗ trợ cấu hình 2 màn hình cho POS (mở rộng màn hình) |

### 7.2. Hiệu năng

| Mã | Yêu cầu | Mô tả |
|----|---------|-------|
| NFR-06 | Thời gian phản hồi API | < 200ms (95th percentile) |
| NFR-07 | Xử lý hóa đơn POS | < 5 giây cho toàn bộ quy trình |
| NFR-08 | Đồng bộ tồn kho đa kênh | < 30 giây |
| NFR-09 | Hỗ trợ đồng thời | 100+ cửa hàng, 500+ người dùng đồng thời |

### 7.3. Bảo mật

| Mã | Yêu cầu | Mô tả |
|----|---------|-------|
| NFR-10 | Xác thực | JWT-based authentication, hỗ trợ OTP 2FA |
| NFR-11 | Phân quyền | Role-Based Access Control (RBAC) chi tiết đến từng chức năng |
| NFR-12 | Audit Log | Ghi lại tất cả thao tác quan trọng (CRUD, thanh toán) |
| NFR-13 | Mã hóa dữ liệu | Mã hóa SSL/TLS, mã hóa dữ liệu nhạy cảm ở database |
| NFR-14 | Sao lưu | Tự động backup database hàng ngày |

### 7.4. Khả năng mở rộng

| Mã | Yêu cầu | Mô tả |
|----|---------|-------|
| NFR-15 | Multi-store | Hỗ trợ nhiều chi nhánh/cửa hàng trên cùng một tài khoản |
| NFR-16 | Multi-tenant | Kiến trúc multi-tenant (mỗi khách hàng một database riêng hoặc schema riêng) |
| NFR-17 | Plugin/Extension | Kiến trúc module cho phép thêm/tắt tính năng dễ dàng |

### 7.5. Tính sẵn sàng

| Mã | Yêu cầu | Mô tả |
|----|---------|-------|
| NFR-18 | Uptime | 99.5% (không bao gồm bảo trì định kỳ) |
| NFR-19 | Offline POS | Hỗ trợ chế độ offline tạm thời cho POS khi mất mạng |

---

## 8. Kiến trúc kỹ thuật đề xuất

### 8.1. Sơ đồ kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Web App  │  │   POS    │  │ Mobile   │  │  Admin  │ │
│  │(NextJS)  │  │(NextJS)  │  │(PWA)     │  │(NextJS) │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│                API Gateway Layer                         │
│    NextJS API Routes / tRPC / GraphQL                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│               Service Layer                               │
│  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌───────┐ │
│  │  POS    ││  Order  ││Product  ││  CRM    ││  ...  │ │
│  │ Service ││ Service ││Service  ││ Service ││Module │ │
│  └─────────┘└─────────┘└─────────┘└─────────┘└───────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Data Layer                                   │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │    MariaDB DB    │  │    Redis Cache    │              │
│  │  (Multi-tenant)  │  │   (Session +      │              │
│  │                  │  │   Hot Data)       │              │
│  └──────────────────┘  └──────────────────┘              │
│  ┌──────────────────┐                                    │
│  │    MinIO/S3      │                                    │
│  │ (File Storage)   │                                    │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

### 8.2. Stack công nghệ đề xuất

| Thành phần | Công nghệ | Ghi chú |
|-----------|-----------|---------|
| **Frontend** | NextJS 14+ (App Router), React, TailwindCSS, shadcn/ui | Server Components + Client Components |
| **State Management** | Zustand / React Query (TanStack Query) | Quản lý state phía client |
| **API Layer** | Next.js API Routes / tRPC | Type-safe API |
| **Database ORM** | Prisma / Drizzle ORM | Type-safe database access |
| **Database** | MariaDB 10.11+ | ACID compliant |
| **Cache** | Redis (Upstash / self-hosted) | Session, cache, rate limiting |
| **Authentication** | NextAuth.js (Auth.js) / Lucia Auth | JWT, session-based |
| **File Storage** | MinIO / AWS S3 / Cloudflare R2 | Lưu trữ hình ảnh, file |
| **Queue/Job** | BullMQ / Inngest | Xử lý bất đồng bộ (đồng bộ TMĐT) |
| **Deployment** | Docker + Docker Compose | Containerized deployment |

### 8.3. Mô hình POS 2 màn hình

```
┌──────────────────────────────────────────────────┐
│                  Màn hình Nhân viên                 │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │  Danh sách      │  │  Giỏ hàng              │  │
│  │  sản phẩm       │  │  - Tên SP | SL | ĐG    │  │
│  │  (Grid/Search)  │  │  - SP1     2   50.000  │  │
│  │                 │  │  - SP2     1   30.000  │  │
│  │  [Tìm kiếm]     │  │  Tổng cộng: 130.000đ  │  │
│  │  [Quét mã vạch] │  │  Giảm giá:  10.000đ   │  │
│  │                 │  │  Thành tiền:120.000đ   │  │
│  │  SP1  SP2  SP3  │  └────────────────────────┘  │
│  │  SP4  SP5  SP6  │  ┌────────────────────────┐  │
│  │  SP7  SP8  SP9  │  │  Thanh toán             │  │
│  └────────────────┘  │  [Tiền mặt][CK][Thẻ]... │  │
│                      └────────────────────────┘  │
├──────────────────────────────────────────────────┤
│            Màn hình Khách hàng (Extended)          │
│  ┌──────────────────────────────────────────────┐ │
│  │        CỬA HÀNG BIZONE                        │ │
│  │                                                │ │
│  │  Sản phẩm:        SL:     Đơn giá:             │ │
│  │  SP1 - Màu đen      2      50.000đ             │ │
│  │  SP2 - Size L       1      30.000đ             │ │
│  │                                                │ │
│  │  ─────────────────────────────────              │ │
│  │  Tạm tính:                   130.000đ           │ │
│  │  Giảm giá (Voucher):         -10.000đ           │ │
│  │  ─────────────────────────────────              │ │
│  │  THÀNH TIỀN:                120.000đ            │ │
│  │                                                │ │
│  │  [QR Thanh toán]  ┌──────┐                     │ │
│  │                   │ QR   │                     │ │
│  │                   └──────┘                     │ │
│  │                                                │ │
│  │  Cảm ơn quý khách!                             │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 9. Luồng nghiệp vụ chính

### 9.1. Luồng bán hàng tại quầy (POS)

```
Khách hàng đến quầy
       │
       ▼
Nhân viên chọn sản phẩm (quét mã vạch/tìm kiếm/chọn từ danh sách)
       │
       ▼
Hiển thị giỏ hàng trên màn hình khách hàng (màn hình 2)
       │
       ▼
Áp dụng khuyến mãi (nếu có) → tự động hoặc thủ công
       │
       ▼
Chọn phương thức thanh toán
  │
  ├── Tiền mặt → Nhập tiền khách → Tính tiền thừa
  ├── Chuyển khoản → Hiển thị số tài khoản/QR
  ├── Thẻ ngân hàng → Kết nối máy POS/QR
  ├── Ví điện tử → QR Momo/VNPay/ZaloPay
  └── Hỗn hợp → Chia tỷ lệ thanh toán
       │
       ▼
Hoàn tất → In hóa đơn / Gửi hóa đơn điện tử
       │
       ▼
Cập nhật tồn kho → Cập nhật điểm thưởng → Ghi nhận doanh số
```

### 9.2. Luồng đồng bộ đa kênh

```
Đơn hàng từ Shopee/Lazada/TikTok Shop/Website
       │
       ▼
API Webhook / Cron Job đồng bộ
       │
       ▼
Tạo đơn hàng trong hệ thống BizOne
       │
       ▼
Trừ tồn kho tự động
       │
       ▼
Đồng bộ tồn kho mới lên các kênh
       │
       ▼
Cập nhật trạng thái đơn hàng trên kênh
```

---

## 10. Kế hoạch triển khai (Roadmap)

### Giai đoạn 1: MVP (Tháng 1-3)

| Module | Tính năng |
|--------|-----------|
| POS | Tạo hóa đơn, quét mã vạch, thanh toán tiền mặt/chuyển khoản, in hóa đơn |
| Sản phẩm | Quản lý danh mục, SKU, giá vốn/giá bán |
| Kho | Nhập kho, xuất kho, tồn kho thời gian thực |
| Đơn hàng | Quản lý đơn tại cửa hàng |
| Báo cáo | Dashboard, doanh thu ngày/tháng, hàng bán chạy |
| CRM | Hồ sơ khách hàng, lịch sử mua hàng |

### Giai đoạn 2: Mở rộng (Tháng 4-6)

| Module | Tính năng |
|--------|-----------|
| POS | Thẻ, ví điện tử, QR, đổi trả, tách/gộp, POS 2 màn hình |
| Kho | Chuyển kho, kiểm kê, cảnh báo tồn kho, lô/HSD |
| Omni Channel | Kết nối website, Shopee, Lazada |
| Nhân viên | Phân quyền, ca làm việc, hoa hồng, audit log |
| Nhà cung cấp | Full module |
| Marketing | Mã giảm giá, voucher, mua X tặng Y |

### Giai đoạn 3: Tối ưu (Tháng 7-9)

| Module | Tính năng |
|--------|-----------|
| Omni Channel | TikTok Shop, Facebook, Instagram, Zalo |
| CRM | Gửi SMS/Email/Zalo, xếp hạng khách hàng |
| Kế toán | Thu chi, quỹ tiền mặt, công nợ, báo cáo tài chính |
| Marketing | Flash sale, chiến dịch marketing, combo |
| Báo cáo | Lợi nhuận, hiệu quả khuyến mãi, hiệu quả nhân viên |
| Mobile | PWA cho chủ cửa hàng |

### Giai đoạn 4: Nâng cao (Tháng 10-12)

| Module | Tính năng |
|--------|-----------|
| AI | Dự báo nhu cầu, gợi ý bán kèm, phân tích hành vi |
| Chatbot | Chatbot bán hàng tự động |
| Tự động hóa | Tự động tạo và gửi báo cáo định kỳ |

---

## 11. Rủi ro & Giảm thiểu

| Rủi ro | Mô tả | Mức độ | Giải pháp |
|--------|-------|--------|-----------|
| Hiệu năng POS chậm | POS cần phản hồi tức thời, nếu chậm sẽ ảnh hưởng trải nghiệm | Cao | Sử dụng Redis cache, tối ưu database, lazy loading |
| Đồng bộ đa kênh sai lệch | Tồn kho không đồng bộ kịp thời giữa các kênh | Cao | Queue xử lý bất đồng bộ, cơ chế retry, cảnh báo khi sai lệch |
| Mất kết nối internet | POS tại cửa hàng mất mạng không thể bán hàng | Cao | Chế độ offline POS (localStorage + đồng bộ khi có mạng lại) |
| Gian lận nhân viên | Nhân viên tạo hóa đơn sai, hủy đơn, biển thủ | Trung bình | Audit log toàn bộ thao tác, phân quyền chặt chẽ, đối soát cuối ca |
| Multi-tenancy phức tạp | Dữ liệu giữa các khách hàng bị lẫn | Cao | Database isolation (mỗi tenant một database/schema riêng) |

---

## 12. Tiêu chí thành công (Success Metrics)

| KPI | Mục tiêu | Cách đo |
|-----|----------|---------|
| Thời gian xử lý giao dịch POS | < 10 giây | Log thời gian tạo hóa đơn |
| Độ chính xác tồn kho | > 99.9% | Đối soát kiểm kê hàng tháng |
| Uptime hệ thống | > 99.5% | Monitoring (UptimeRobot, Sentry) |
| Thời gian đồng bộ đa kênh | < 30 giây | Theo dõi queue xử lý |
| Số lượng đơn hàng xử lý/tháng | Tăng 30% sau 3 tháng | Báo cáo hệ thống |
| Hài lòng khách hàng (NPS) | > 70 | Khảo sát định kỳ |

---

## 13. Giả định & Phụ thuộc

| Giả định / Phụ thuộc | Mô tả |
|-----------------------|-------|
| Hạ tầng cloud | Triển khai trên cloud (AWS/GCP/VPS) với khả năng scale ngang |
| API sàn TMĐT | Các sàn Shopee, Lazada, TikTok Shop cung cấp API ổn định |
| Kết nối ngân hàng | Đối tác cổng thanh toán (VNPay, Momo, PayOS) cung cấp API tích hợp |
| Thiết bị POS | Cửa hàng có máy tính/màn hình cảm ứng, máy in hóa đơn nhiệt, máy quét mã vạch |
| Kiến thức người dùng | Người dùng có kiến thức cơ bản về sử dụng web và thiết bị văn phòng |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*
