# SRS - Software Requirements Specification

## Phần mềm Quản lý Bán hàng BizOne

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne - Omni Channel POS & Management Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 11/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Giới thiệu

### 1.1. Mục đích

Tài liệu này mô tả chi tiết các yêu cầu phần mềm (Software Requirements Specification) cho hệ thống BizOne - nền tảng quản lý bán hàng All-In-One dành cho các cửa hàng SME. Tài liệu được xây dựng dựa trên BRD (Business Requirements Document) và URD (User Requirements Document), nhằm cung cấp đầy đủ thông tin cho nhóm phát triển, kiểm thử và triển khai.

### 1.2. Phạm vi

Hệ thống BizOne bao gồm 12 module chính:
1. Bán hàng (POS)
2. Quản lý Sản phẩm
3. Quản lý Kho
4. CRM (Quản lý Khách hàng)
5. Quản lý Đơn hàng
6. Quản lý Nhân viên
7. Báo cáo & Phân tích
8. Quản lý Nhà cung cấp
9. Bán hàng Đa kênh (Omni Channel)
10. Kế toán & Tài chính
11. Marketing & Khuyến mãi
12. Cài đặt & Cấu hình Hệ thống

### 1.3. Định nghĩa, thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| POS | Point of Sale - Điểm bán hàng |
| SKU | Stock Keeping Unit - Mã hàng hóa |
| CRM | Customer Relationship Management - Quản lý quan hệ khách hàng |
| PWA | Progressive Web Application - Ứng dụng web tiến bộ |
| Omni Channel | Bán hàng đa kênh đồng bộ |
| RBAC | Role-Based Access Control - Phân quyền dựa trên vai trò |
| Audit Log | Nhật ký thao tác |
| COD | Cash on Delivery - Thanh toán khi nhận hàng |
| Tenant | Khách hàng sử dụng hệ thống (cửa hàng/doanh nghiệp) |
| MST | Mã số thuế |
| HSD | Hạn sử dụng |

### 1.4. Tài liệu tham khảo

| Tài liệu | Mô tả |
|----------|-------|
| BRD-BizOne.md | Business Requirements Document |
| URD-BizOne.md | User Requirements Document |
| bizone.txt | Danh sách tính năng tổng quan |
| env.txt | Biến môi trường và cấu hình hệ thống |

---

## 2. Mô tả tổng quan hệ thống

### 2.1. Góc nhìn sản phẩm

BizOne là hệ thống quản lý bán hàng All-In-One hoạt động trên nền tảng web sử dụng **NextJS** và cơ sở dữ liệu **MariaDB**. Hệ thống hỗ trợ mô hình bán hàng **Omni Channel**, cho phép đồng bộ tồn kho, đơn hàng và dữ liệu khách hàng trên tất cả các kênh bán.

Người dùng tương tác qua:
- **Web App** (NextJS): giao diện quản lý chính
- **POS Web App** (NextJS): giao diện bán hàng tại quầy, hỗ trợ 2 màn hình
- **PWA Mobile**: ứng dụng di động cho chủ cửa hàng

### 2.2. Đặc điểm người dùng

| Nhóm | Vai trò | Mục tiêu chính |
|------|---------|----------------|
| Admin (Owner) | Chủ cửa hàng/doanh nghiệp | Giám sát tổng thể, kiểm soát lợi nhuận, ra quyết định |
| Manager | Quản lý vận hành | Điều hành hoạt động hàng ngày, quản lý nhân viên |
| Seller | Nhân viên bán hàng | Tạo hóa đơn nhanh, phục vụ khách hàng tại quầy |
| Warehouse Staff | Nhân viên kho | Nhập/xuất/kiểm kê hàng hóa |
| Viewer | Chủ cửa hàng (chế độ xem) | Xem báo cáo, dashboard, không thao tác |

### 2.3. Môi trường hoạt động

**Phần cứng yêu cầu:**
- POS: Máy tính/màn hình cảm ứng, máy in hóa đơn nhiệt, máy quét mã vạch
- Mobile: Smartphone/tablet có trình duyệt hỗ trợ PWA

**Phần mềm yêu cầu:**
- Trình duyệt: Chrome 100+, Firefox 100+, Edge 100+, Safari 15+
- Kết nối Internet ổn định

### 2.4. Ràng buộc thiết kế và triển khai

- Kiến trúc multi-tenant (mỗi tenant một database/schema riêng)
- Triển khai containerized với Docker + Docker Compose
- Hỗ trợ offline POS tạm thời khi mất mạng

---

## 3. Kiến trúc hệ thống

### 3.1. Kiến trúc tổng quan

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

### 3.2. Stack công nghệ

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
| **Queue/Job** | BullMQ / Inngest | Xử lý bất đồng bộ |
| **Deployment** | Docker + Docker Compose | Containerized deployment |

### 3.3. Cấu hình môi trường

```
# database
address: localhost
port: 3306
schema: bizonedb
username: root
password: mypass
collate: utf8_general_ci

# redis
address: localhost
port: 6379
password: 123456

# minio
address: localhost
port: 9000 / 9001
username: admin
password: 123456a@
bucket: bizone
```

---

## 4. Yêu cầu chức năng

### 4.1. Module Bán hàng (POS)

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-POS-01 | Tạo hóa đơn nhanh | Quét mã vạch hoặc tìm kiếm sản phẩm để tạo hóa đơn; thời gian tối đa 5-10 giây/giao dịch | Cao |
| SRS-POS-02 | POS 2 màn hình | Màn hình nhân viên (thao tác) và màn hình khách hàng (hiển thị). Đồng bộ real-time qua BroadcastChannel API / WebSocket | Cao |
| SRS-POS-03 | Đa phương thức thanh toán | Tiền mặt, chuyển khoản (hiển thị STK/QR), thẻ ngân hàng, ví điện tử (Momo/VNPay/ZaloPay), QR Code, thanh toán hỗn hợp | Cao |
| SRS-POS-04 | In hóa đơn / gửi hóa đơn điện tử | In hóa đơn nhiệt (< 3 giây), gửi email/SMS hóa đơn | Cao |
| SRS-POS-05 | Tách / gộp hóa đơn | Tách một hóa đơn thành nhiều hóa đơn nhỏ hoặc gộp nhiều hóa đơn | Trung bình |
| SRS-POS-06 | Đổi trả hàng | Xử lý đổi/trả hàng, hoàn tiền, cập nhật tồn kho. Hoàn tất trong < 30 giây | Cao |
| SRS-POS-07 | Áp dụng khuyến mãi | Áp dụng voucher, mã giảm giá, khuyến mãi tự động theo điều kiện | Cao |
| SRS-POS-08 | Khóa ca & Đối soát cuối ca | Tổng kết doanh số, đối soát quỹ tiền mặt, ghi nhận chênh lệch | Cao |
| SRS-POS-09 | Tạo đơn đặt hàng trước (pre-order) | Cho phép đặt cọc và tạo đơn giao sau | Thấp |
| SRS-POS-10 | Quản lý hóa đơn nhanh | Tìm kiếm real-time < 200ms, lưu danh sách sản phẩm bán nhanh, tự động focus ô tìm kiếm khi quét mã vạch | Cao |

**Luồng xử lý chính POS:**
1. Nhân viên đăng nhập → mở ca
2. Thêm sản phẩm: quét mã vạch / tìm kiếm / chọn từ danh sách
3. Giỏ hàng hiển thị trên cả 2 màn hình
4. Áp dụng khuyến mãi (tự động/thủ công)
5. Chọn phương thức thanh toán
6. Xác nhận → tạo hóa đơn → in/gửi hóa đơn
7. Cập nhật tồn kho, điểm thưởng, doanh số

### 4.2. Module Quản lý Sản phẩm

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-PROD-01 | Danh mục hàng hóa | Quản lý cây danh mục dạng tree, tối đa 5 cấp; kéo-thả sắp xếp; ẩn/hiện danh mục | Cao |
| SRS-PROD-02 | SKU & Mã vạch | Tạo và quản lý mã SKU (tự động sinh theo rule), mã vạch cho từng sản phẩm; kiểm tra trùng lặp | Cao |
| SRS-PROD-03 | Đa đơn vị tính | Hỗ trợ nhiều đơn vị tính (cái/thùng/hộp) và quy đổi; mỗi đơn vị có giá riêng, mã vạch riêng | Cao |
| SRS-PROD-04 | Thuộc tính sản phẩm | Màu sắc, kích cỡ, phiên bản; tạo biến thể tự động từ tổ hợp thuộc tính; mỗi biến thể có SKU, tồn kho, giá riêng | Cao |
| SRS-PROD-05 | Combo / Gói sản phẩm | Tạo combo từ nhiều sản phẩm; tự động tính giá vốn combo; khi bán tự động trừ tồn kho từng sản phẩm thành phần | Trung bình |
| SRS-PROD-06 | Giá vốn & Giá bán | Theo dõi giá vốn, giá bán, biên lợi nhuận; quản lý thuế suất VAT | Cao |
| SRS-PROD-07 | Import/Export sản phẩm | Import/Export qua file Excel (.xlsx); cung cấp template; kiểm tra dữ liệu; báo cáo lỗi | Trung bình |

**Thông tin sản phẩm bao gồm:**
- Tên sản phẩm (bắt buộc)
- Mã SKU (tự động sinh, có thể sửa)
- Mã vạch (tùy chọn)
- Danh mục
- Đơn vị tính cơ bản
- Giá bán (đã bao gồm VAT hoặc chưa tùy cấu hình)
- Hình ảnh (tối đa 5 ảnh)
- Trạng thái (Đang bán / Ngừng bán / Hết hàng)
- Giá vốn, Mô tả, Thuế suất, Tồn kho tối thiểu, Vị trí kho, Nhà cung cấp mặc định

### 4.3. Module Quản lý Kho

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-WH-01 | Nhập kho | Tạo phiếu nhập kho từ đơn nhập hàng hoặc nhập trực tiếp; quét mã vạch liên tục; nhập lô, HSD | Cao |
| SRS-WH-02 | Xuất kho | Xuất kho cho đơn bán, chuyển kho, hủy hàng | Cao |
| SRS-WH-03 | Chuyển kho | Chuyển hàng giữa các chi nhánh/kho; quy trình 3 bước: tạo phiếu → xuất kho nguồn → nhập kho đích | Trung bình |
| SRS-WH-04 | Kiểm kê kho | Tạo phiếu kiểm kê; nhập số lượng thực tế; tự động tính chênh lệch; điều chỉnh tồn kho; hỗ trợ kiểm kê di động | Cao |
| SRS-WH-05 | Tồn kho thời gian thực | Cập nhật tồn kho ngay sau mỗi giao dịch (< 1 giây) | Cao |
| SRS-WH-06 | Cảnh báo tồn kho | Tự động cảnh báo khi hàng tồn dưới ngưỡng; cảnh báo HSD (30/14/7 ngày); cảnh báo hàng tồn lâu (> 90 ngày) | Cao |
| SRS-WH-07 | Quản lý lô & HSD | Theo dõi lô hàng, hạn sử dụng; cảnh báo hết hạn | Trung bình |

### 4.4. Module CRM (Quản lý Khách hàng)

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-CRM-01 | Hồ sơ khách hàng | Lưu thông tin: tên, SĐT (unique), email, địa chỉ, ngày sinh, giới tính, ghi chú, nhóm, xếp hạng, điểm tích lũy, tổng chi tiêu | Cao |
| SRS-CRM-02 | Lịch sử mua hàng | Xem toàn bộ lịch sử giao dịch; hiển thị chi tiết hóa đơn | Cao |
| SRS-CRM-03 | Phân nhóm khách hàng | Phân loại theo nhóm (bán buôn, bán lẻ, VIP...); lọc và tìm kiếm theo nhóm | Trung bình |
| SRS-CRM-04 | Tích điểm thành viên | Tích điểm tự động khi tạo hóa đơn; Admin cấu hình tỷ lệ tích điểm; khách hàng dùng điểm thanh toán | Cao |
| SRS-CRM-05 | Xếp hạng khách hàng | Silver / Gold / VIP / Diamond với đặc quyền khác nhau; tự động nâng/giảm hạng định kỳ | Trung bình |
| SRS-CRM-06 | Gửi SMS/Email/Zalo Marketing | Gửi thông báo khuyến mãi, chăm sóc khách hàng; hỗ trợ template | Trung bình |
| SRS-CRM-07 | Theo dõi công nợ | Quản lý công nợ phải thu; hạn mức tín dụng; nhắc nợ tự động; in sao kê | Cao |
| SRS-CRM-08 | Hợp nhất khách hàng | Merge 2 khách hàng trùng | Trung bình |

**Xếp hạng thành viên mặc định:**

| Hạng | Điều kiện | Đặc quyền |
|------|-----------|-----------|
| Silver | Mới đăng ký | 1.000đ = 1 điểm |
| Gold | Chi tiêu > 5 triệu | 1.000đ = 1.2 điểm, giảm 5% |
| VIP | Chi tiêu > 20 triệu | 1.000đ = 1.5 điểm, giảm 10% |
| Diamond | Chi tiêu > 50 triệu | 1.000đ = 2 điểm, giảm 15%, miễn phí vận chuyển |

### 4.5. Module Quản lý Đơn hàng

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-ORD-01 | Đơn tại cửa hàng | Quản lý đơn bán tại quầy | Cao |
| SRS-ORD-02 | Đơn online | Đồng bộ đơn hàng từ website, sàn TMĐT | Cao |
| SRS-ORD-03 | Đơn giao hàng | Quản lý đơn giao hàng tận nơi; chọn ĐVVC (GHN, GHTK, Shopee Express); nhập mã vận đơn; theo dõi trạng thái | Cao |
| SRS-ORD-04 | Theo dõi trạng thái | Chờ xác nhận → Đang chuẩn bị → Đang giao → Hoàn thành / Hủy; hiển thị màu sắc theo trạng thái | Cao |
| SRS-ORD-05 | Quản lý đổi trả | Tạo phiếu đổi/trả; liên kết với hóa đơn gốc; cập nhật tồn kho | Cao |
| SRS-ORD-06 | Bộ lọc & tìm kiếm | Lọc theo kênh, trạng thái, thời gian, nhân viên; tìm theo mã đơn, tên/SĐT khách | Cao |

### 4.6. Module Quản lý Nhân viên

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-STAFF-01 | Phân quyền người dùng | RBAC chi tiết đến từng module và thao tác; Admin/Manager/Seller/Warehouse/Viewer + vai trò tùy chỉnh | Cao |
| SRS-STAFF-02 | Ca làm việc | Tạo và quản lý ca làm việc; xếp lịch dạng calendar; gán nhân viên | Trung bình |
| SRS-STAFF-03 | Chấm công | Check-in/check-out; tính giờ làm, đi trễ, về sớm; bảng chấm công theo tuần/tháng | Trung bình |
| SRS-STAFF-04 | Doanh số nhân viên | Theo dõi doanh số theo từng nhân viên; ghi nhận tự động từ POS | Cao |
| SRS-STAFF-05 | Hoa hồng | Tính hoa hồng tự động theo % doanh số, % lợi nhuận, hoặc theo sản phẩm; Admin cấu hình công thức | Trung bình |
| SRS-STAFF-06 | Audit Log | Ghi lại toàn bộ thao tác quan trọng (CRUD, thanh toán, cấu hình); append-only; lưu tối thiểu 90 ngày | Cao |

**Chi tiết Audit Log:**
- Thao tác ghi log: đăng nhập/xuất, tạo/sửa/xóa hóa đơn, đổi trả, thêm/sửa/xóa sản phẩm, nhập/xuất/kiểm kê kho, thêm/sửa/xóa nhân viên, thay đổi cấu hình, tạo/sửa/xóa mã giảm giá
- Mỗi log: thời gian, người thực hiện, IP, thiết bị, nội dung, dữ liệu cũ/mới

### 4.7. Module Báo cáo & Phân tích

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-RPT-01 | Dashboard tổng quan | Doanh thu hôm nay, đơn hàng, khách mới, SP đã bán; biểu đồ doanh thu 7 ngày; top SP bán chạy; top nhân viên; tồn kho cảnh báo; đơn chưa xử lý | Cao |
| SRS-RPT-02 | Báo cáo doanh thu | Theo ngày/tuần/tháng/năm; lọc theo chi nhánh, nhân viên, danh mục; so sánh cùng kỳ; doanh thu theo PT thanh toán | Cao |
| SRS-RPT-03 | Báo cáo lợi nhuận | Lợi nhuận gộp = Doanh thu - Giá vốn; hiển thị biên lợi nhuận; top SP lợi nhuận cao/thấp | Cao |
| SRS-RPT-04 | Hàng bán chạy / bán chậm | Top 10 bán chạy, top 10 tồn lâu nhất | Cao |
| SRS-RPT-05 | Hiệu quả khuyến mãi | So sánh doanh thu trước/sau/trong khuyến mãi | Trung bình |
| SRS-RPT-06 | Hiệu quả nhân viên | Doanh số, số đơn, giá trị TB/đơn theo từng nhân viên | Trung bình |
| SRS-RPT-07 | Báo cáo tồn kho | Giá trị tồn kho, hàng sắp hết, hàng quá hạn | Cao |
| SRS-RPT-08 | Xuất báo cáo | Xuất PDF, Excel cho tất cả báo cáo; gửi email tự động định kỳ | Trung bình |

### 4.8. Module Quản lý Nhà cung cấp

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-SUP-01 | Danh sách nhà cung cấp | Quản lý thông tin: tên, MST, SĐT, email, địa chỉ, người liên hệ, nhóm hàng, điều khoản thanh toán, công nợ | Cao |
| SRS-SUP-02 | Đơn nhập hàng | Tạo đơn nhập hàng; chọn nhà cung cấp, sản phẩm, số lượng, đơn giá; theo dõi trạng thái (Chờ nhập / Đã nhập 1 phần / Đã nhập / Đã hủy) | Cao |
| SRS-SUP-03 | Công nợ nhà cung cấp | Quản lý công nợ phải trả; ghi nhận thanh toán; cảnh báo quá hạn | Trung bình |
| SRS-SUP-04 | Lịch sử giao dịch | Lịch sử nhập hàng và thanh toán | Cao |
| SRS-SUP-05 | So sánh giá nhập | So sánh giá nhập giữa các nhà cung cấp cho cùng sản phẩm | Trung bình |

### 4.9. Module Bán hàng Đa kênh (Omni Channel)

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-OMNI-01 | Website bán hàng | Website TMĐT tích hợp sẵn; tên miền `[ten-cua-hang].bizone.vn` hoặc tên miền riêng; giỏ hàng, thanh toán online; đồng bộ tự động | Cao |
| SRS-OMNI-02 | Kết nối sàn TMĐT | Shopee, Lazada, TikTok Shop; xác thực OAuth; đồng bộ sản phẩm, tồn kho, đơn hàng; map danh mục | Cao |
| SRS-OMNI-03 | Kết nối MXH | Facebook, Instagram, Zalo; đăng bán và nhận đơn | Trung bình |
| SRS-OMNI-04 | Đồng bộ tồn kho đa kênh | Tồn kho tự động cập nhật trên tất cả kênh khi có giao dịch; thời gian < 30 giây | Cao |
| SRS-OMNI-05 | Đồng bộ đơn hàng | Đơn từ các kênh tự động đồng bộ về hệ thống quản lý tập trung; xử lý lỗi retry + thông báo | Cao |

### 4.10. Module Kế toán & Tài chính

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-ACC-01 | Thu chi | Ghi nhận thu/chi hàng ngày; danh mục thu/chi tùy chỉnh; xem sổ quỹ | Cao |
| SRS-ACC-02 | Quỹ tiền mặt | Quản lý số dư quỹ; đối soát cuối ca; quản lý nhiều quỹ; lịch sử biến động | Cao |
| SRS-ACC-03 | Công nợ | Theo dõi công nợ phải thu / phải trả; cảnh báo quá hạn; ghi nhận thanh toán | Cao |
| SRS-ACC-04 | Xuất báo cáo tài chính | Báo cáo lời lỗ, báo cáo dòng tiền cơ bản | Trung bình |
| SRS-ACC-05 | Đối soát thanh toán | Đối soát giữa hóa đơn và thanh toán từ các kênh | Trung bình |

### 4.11. Module Marketing & Khuyến mãi

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-MKT-01 | Mã giảm giá | Tạo mã giảm giá (% / số tiền cố định / miễn phí vận chuyển); điều kiện áp dụng; giới hạn sử dụng; thời gian hiệu lực | Cao |
| SRS-MKT-02 | Voucher | Tạo voucher cho khách hàng thân thiết | Trung bình |
| SRS-MKT-03 | Flash sale | Thiết lập flash sale theo khung giờ; sản phẩm + giá flash; giới hạn số lượng; tự động hết hiệu lực | Trung bình |
| SRS-MKT-04 | Combo khuyến mãi | Tạo combo giá ưu đãi | Trung bình |
| SRS-MKT-05 | Mua X tặng Y | Chương trình mua hàng tặng hàng; tự động áp dụng tại POS khi thỏa điều kiện | Cao |
| SRS-MKT-06 | Chiến dịch Marketing | Gửi SMS/Email/Zalo hàng loạt theo chiến dịch; quản lý danh sách đối tượng | Trung bình |

### 4.12. Module Cài đặt & Cấu hình Hệ thống

| ID | Yêu cầu | Mô tả | Ưu tiên |
|----|---------|-------|---------|
| SRS-CONFIG-01 | Cấu hình cửa hàng | Thông tin cửa hàng, chi nhánh, thuế, tiền tệ, đơn vị, POS (máy in, 2 màn hình), tích điểm, cảnh báo tồn kho, giờ làm việc | Cao |
| SRS-CONFIG-02 | Quản lý vai trò & quyền | Xem danh sách vai trò mặc định; thêm/sửa vai trò; cấu hình quyền chi tiết theo module và thao tác; sao chép quyền | Cao |
| SRS-CONFIG-03 | Quản lý chi nhánh | Thêm/sửa/xóa chi nhánh/kho; cấu hình thông tin từng chi nhánh | Cao |

---

## 5. Yêu cầu phi chức năng

### 5.1. Hiệu năng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-01 | Thời gian phản hồi API | < 200ms (95th percentile) |
| SRS-NFR-02 | Xử lý hóa đơn POS | < 5 giây cho toàn bộ quy trình từ chọn SP đến hoàn tất |
| SRS-NFR-03 | Đồng bộ tồn kho đa kênh | < 30 giây |
| SRS-NFR-04 | Tìm kiếm sản phẩm | < 300ms (real-time search) |
| SRS-NFR-05 | Dashboard load | < 2 giây |
| SRS-NFR-06 | Xuất báo cáo | < 5 giây (Excel/PDF) |
| SRS-NFR-07 | Hỗ trợ đồng thời | 500+ người dùng đồng thời |
| SRS-NFR-08 | In hóa đơn nhiệt | < 3 giây sau khi thanh toán |

### 5.2. Bảo mật

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-09 | Xác thực | JWT-based authentication; hỗ trợ OTP 2FA |
| SRS-NFR-10 | Phân quyền | RBAC chi tiết đến từng chức năng; kiểm tra quyền ở cả client và server |
| SRS-NFR-11 | Audit Log | Ghi lại tất cả thao tác quan trọng; append-only, không thể xóa/sửa |
| SRS-NFR-12 | Mã hóa | SSL/TLS cho truyền tải; mã hóa dữ liệu nhạy cảm ở database |
| SRS-NFR-13 | Sao lưu | Tự động backup database hàng ngày |
| SRS-NFR-14 | Data isolation | Multi-tenant isolation; dữ liệu tenant A không thể bị tenant B truy cập |

### 5.3. Tính sẵn sàng & Độ tin cậy

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-15 | Uptime | 99.5% (không bao gồm bảo trì định kỳ) |
| SRS-NFR-16 | Offline POS | Hỗ trợ chế độ offline tạm thời; đồng bộ khi có mạng trở lại |
| SRS-NFR-17 | Xử lý lỗi đồng bộ | Retry tự động; thông báo khi đồng bộ thất bại |

### 5.4. Khả năng mở rộng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-18 | Multi-store | Hỗ trợ nhiều chi nhánh/cửa hàng trên cùng một tài khoản |
| SRS-NFR-19 | Multi-tenant | Mỗi tenant một database/schema riêng |
| SRS-NFR-20 | Kiến trúc module | Cho phép thêm/tắt tính năng dễ dàng |

### 5.5. Giao diện & Trải nghiệm người dùng

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-21 | Responsive | Desktop (> 1024px), Tablet (768-1024px), Mobile PWA (< 768px) |
| SRS-NFR-22 | POS tối ưu cảm ứng | Nút bấm tối thiểu 44x44px; font tối thiểu 16px; số tiền hiển thị lớn |
| SRS-NFR-23 | Phím tắt | Hỗ trợ phím tắt cho mọi thao tác POS |
| SRS-NFR-24 | Accessibility | Độ tương phản màu sắc đạt WCAG AA |
| SRS-NFR-25 | Bảng màu | Primary: #2563EB, Secondary: #6B7280, Success: #10B981, Warning: #F59E0B, Error: #EF4444 |
| SRS-NFR-26 | Font | Inter (Web), SF Pro (macOS); 14px body, 16px heading, 20px+ POS |

### 5.6. Công nghệ & Kiến trúc

| ID | Yêu cầu | Mô tả |
|----|---------|-------|
| SRS-NFR-27 | Frontend | NextJS 14+ (App Router), React, TailwindCSS, shadcn/ui |
| SRS-NFR-28 | State Management | Zustand / TanStack Query |
| SRS-NFR-29 | API Layer | Next.js API Routes / tRPC |
| SRS-NFR-30 | Database ORM | Prisma / Drizzle ORM |
| SRS-NFR-31 | Database | MariaDB 10.11+ |
| SRS-NFR-32 | Cache | Redis |
| SRS-NFR-33 | Authentication | NextAuth.js / Lucia Auth |
| SRS-NFR-34 | File Storage | MinIO / AWS S3 / Cloudflare R2 |
| SRS-NFR-35 | Queue/Job | BullMQ / Inngest |
| SRS-NFR-36 | Deployment | Docker + Docker Compose |

---

## 6. Yêu cầu dữ liệu

### 6.1. Dữ liệu đầu vào

| Module | Dữ liệu nhập | Định dạng | Validation |
|--------|-------------|-----------|------------|
| Sản phẩm | Tên, SKU, giá, tồn kho | Text, number | SKU unique, giá > 0 |
| Khách hàng | Tên, SĐT, email | Text, phone, email | SĐT unique, đúng format |
| Hóa đơn | Sản phẩm, SL, giá, thanh toán | Array, number | SL > 0, tổng tiền >= 0 |
| Nhập kho | Sản phẩm, SL, đơn giá | Array, number | SL > 0, đơn giá >= 0 |
| Nhân viên | Tên, SĐT, email, vai trò | Text, phone, email, select | SĐT/email unique |

### 6.2. Dữ liệu đầu ra

| Module | Dữ liệu xuất | Định dạng |
|--------|-------------|-----------|
| Sản phẩm | Danh sách sản phẩm | Excel |
| Báo cáo | Doanh thu, lợi nhuận, tồn kho | PDF, Excel |
| Hóa đơn | Hóa đơn bán hàng | In nhiệt, PDF, Email |
| Khách hàng | Danh sách khách hàng | Excel |
| Đơn hàng | Danh sách đơn hàng | Excel |

### 6.3. Dữ liệu seed (khi tạo tenant mới)

- Tài khoản Admin mặc định
- Các vai trò mặc định (Admin, Manager, Seller, Warehouse, Viewer)
- Danh mục sản phẩm mẫu (Thời trang, Điện tử, Thực phẩm...)
- Sản phẩm mẫu
- Cấu hình mặc định (thuế, tỷ lệ tích điểm...)

---

## 7. Yêu cầu giao diện

### 7.1. Cấu trúc giao diện tổng thể

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (trái)      │  Main Content Area                │
│  ┌───────────────┐   │  ┌─────────────────────────────┐  │
│  │ Logo          │   │  │ Top Bar (Search + Notif +  │  │
│  │               │   │  │ Profile)                    │  │
│  │ Dashboard     │   │  ├─────────────────────────────┤  │
│  │ POS           │   │  │                              │  │
│  │ Sản phẩm      │   │  │   Nội dung chính             │  │
│  │ Kho hàng      │   │  │   (thay đổi theo module)    │  │
│  │ CRM           │   │  │                              │  │
│  │ Đơn hàng      │   │  │                              │  │
│  │ Nhân viên     │   │  │                              │  │
│  │ Báo cáo       │   │  │                              │  │
│  │ Nhà cung cấp   │   │  └─────────────────────────────┘  │
│  │ Omni Channel  │   │                                    │
│  │ Marketing     │   │                                    │
│  │ Kế toán       │   │                                    │
│  │ Cài đặt       │   │                                    │
│  └───────────────┘   └─────────────────────────────────────┘
└─────────────────────────────────────────────────────────┘
```

### 7.2. Giao diện POS

- Layout 2 panel: danh sách sản phẩm (trái) + giỏ hàng (phải)
- Tìm kiếm sản phẩm real-time
- Nút thanh toán lớn, dễ chạm
- Hỗ trợ bàn phím số riêng
- Tự động focus ô tìm kiếm khi quét mã vạch
- Toast notification khi thêm sản phẩm

### 7.3. Màn hình khách hàng (POS Extended)

- Hiển thị danh sách sản phẩm, số lượng, đơn giá
- Tổng tiền, giảm giá, thành tiền (hiển thị lớn)
- QR Code thanh toán
- Không có nút thao tác (presentation mode)
- Tự động refresh real-time

### 7.4. Danh sách màn hình chính

| STT | Màn hình | Module | Vai trò truy cập |
|-----|----------|--------|------------------|
| 1 | Dashboard tổng quan | Báo cáo | Admin, Manager, Viewer |
| 2 | POS Bán hàng | POS | Seller, Manager |
| 3 | Màn hình khách hàng (POS) | POS | (Hiển thị) |
| 4 | Danh sách sản phẩm | Sản phẩm | Manager, Warehouse |
| 5 | Thêm/Sửa sản phẩm | Sản phẩm | Manager, Admin |
| 6 | Danh mục sản phẩm | Sản phẩm | Manager, Admin |
| 7 | Nhập kho | Kho | Warehouse, Manager |
| 8 | Xuất kho | Kho | Warehouse, Manager |
| 9 | Kiểm kê kho | Kho | Warehouse, Manager |
| 10 | Chuyển kho | Kho | Warehouse, Manager |
| 11 | Danh sách khách hàng | CRM | Seller, Manager |
| 12 | Chi tiết khách hàng | CRM | Seller, Manager |
| 13 | Danh sách đơn hàng | Đơn hàng | Seller, Manager |
| 14 | Chi tiết đơn hàng | Đơn hàng | Seller, Manager |
| 15 | Danh sách nhân viên | Nhân viên | Admin |
| 16 | Ca làm việc | Nhân viên | Manager |
| 17 | Chấm công | Nhân viên | Seller, Manager |
| 18 | Audit Log | Nhân viên | Admin |
| 19 | Báo cáo doanh thu | Báo cáo | Admin, Manager, Viewer |
| 20 | Báo cáo lợi nhuận | Báo cáo | Admin, Manager |
| 21 | Danh sách nhà cung cấp | Nhà cung cấp | Manager, Admin |
| 22 | Đơn nhập hàng | Nhà cung cấp | Manager, Admin |
| 23 | Kết nối kênh bán | Omni Channel | Admin |
| 24 | Mã giảm giá | Marketing | Admin, Manager |
| 25 | Flash Sale | Marketing | Admin, Manager |
| 26 | Sổ thu chi | Kế toán | Admin, Manager |
| 27 | Công nợ | Kế toán | Admin, Manager |
| 28 | Cấu hình cửa hàng | Cài đặt | Admin |
| 29 | Phân quyền | Cài đặt | Admin |

---

## 8. Yêu cầu tích hợp

### 8.1. Tích hợp thanh toán

- VNPay (cổng thanh toán online)
- Momo (ví điện tử, QR)
- PayOS
- Máy POS thẻ ngân hàng

### 8.2. Tích hợp sàn TMĐT

- Shopee API
- Lazada API
- TikTok Shop API

### 8.3. Tích hợp vận chuyển

- GHN (Giao hàng nhanh)
- GHTK (Giao hàng tiết kiệm)
- Shopee Express

### 8.4. Tích hợp truyền thông

- SMS Gateway
- SMTP Email
- Zalo OA (Official Account)

### 8.5. Tích hợp khác

- Máy in hóa đơn nhiệt (USB/Bluetooth/Network)
- Máy quét mã vạch (USB/Bluetooth)
- Màn hình cảm ứng

---

## 9. Yêu cầu thông báo

| Loại | Kênh | Đối tượng | Nội dung |
|------|------|-----------|----------|
| Đơn hàng mới (online) | Hệ thống + Email | Manager | "Đơn hàng #123 từ Shopee - 850,000đ" |
| Cảnh báo tồn kho | Hệ thống | Warehouse | "Áo Thun Nam sắp hết (còn 2)" |
| Kiểm kê chênh lệch | Hệ thống | Manager | "Kiểm kê kho H1 chênh lệch 5 SP" |
| Công nợ quá hạn | Hệ thống + SMS | Admin | "KH Nguyễn Văn A nợ 2,500,000đ quá 30 ngày" |
| Đồng bộ lỗi | Hệ thống | Admin | "Đồng bộ Shopee thất bại: token hết hạn" |
| Báo cáo định kỳ | Email | Admin/Manager | "Báo cáo doanh thu tháng 6" |
| Nhắc ca làm việc | Hệ thống | Seller | "Ca làm việc của bạn bắt đầu lúc 09:00" |

**Kênh thông báo:**
- Hệ thống (Notification Center trong app)
- Web Push Notification
- Email (SMTP template)
- SMS (SMS Gateway)
- Zalo (Zalo OA)

---

## 10. Tiêu chí chấp nhận

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-POS-01 | Tạo hóa đơn < 5 giây | Từ khi chọn SP đầu tiên đến khi hoàn tất thanh toán |
| AC-POS-02 | Quét mã vạch | Quét barcode tự động thêm SP vào giỏ, không cần thao tác thêm |
| AC-POS-03 | POS 2 màn hình | Màn hình khách hàng cập nhật real-time, không lag |
| AC-POS-04 | In hóa đơn | In hóa đơn nhiệt trong < 3 giây sau khi thanh toán |
| AC-POS-05 | Đổi trả | Đổi trả hàng hoàn tất trong < 30 giây |
| AC-WH-01 | Tồn kho real-time | Sau khi thanh toán, tồn kho cập nhật trong < 1 giây |
| AC-WH-02 | Kiểm kê | Kiểm kê 1000 sản phẩm trong < 30 phút |
| AC-WH-03 | Cảnh báo tồn kho | Cảnh báo hiển thị trong < 5 giây sau khi tồn kho xuống dưới ngưỡng |
| AC-RPT-01 | Dashboard load | Dashboard tải trong < 2 giây |
| AC-RPT-02 | Báo cáo xuất | Xuất báo cáo Excel/PDF trong < 5 giây |
| AC-RPT-03 | Dữ liệu real-time | Dashboard hiển thị dữ liệu cách đây tối đa 30 giây |
| AC-PERF-01 | API response | 95% API requests hoàn thành trong < 200ms |
| AC-PERF-02 | Concurrent users | Hệ thống hỗ trợ 500+ người dùng đồng thời |
| AC-PERF-03 | Search response | Tìm kiếm sản phẩm phản hồi trong < 300ms |
| AC-SEC-01 | Authentication | Người dùng không thể truy cập nội dung khi chưa đăng nhập |
| AC-SEC-02 | Authorization | Người dùng chỉ thấy được module/quyền được cấp |
| AC-SEC-03 | Audit | Mọi thao tác CRUD quan trọng đều được ghi log |
| AC-SEC-04 | Data isolation | Dữ liệu của tenant A không thể bị tenant B truy cập |

---

## 11. Kế hoạch phát triển

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

## 12. Phụ lục

### Bảng thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| POS | Point of Sale - Điểm bán hàng |
| SKU | Stock Keeping Unit - Mã hàng hóa |
| CRM | Customer Relationship Management - Quản lý quan hệ khách hàng |
| PWA | Progressive Web Application - Ứng dụng web tiến bộ |
| Omni Channel | Bán hàng đa kênh đồng bộ |
| RBAC | Role-Based Access Control - Phân quyền dựa trên vai trò |
| Audit Log | Nhật ký thao tác |
| COD | Cash on Delivery - Thanh toán khi nhận hàng |
| Tenant | Khách hàng sử dụng hệ thống (cửa hàng/doanh nghiệp) |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*

*Version history:*
| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 11/06/2026 | 1.0 | | Tạo mới dựa trên BRD-BizOne.md, URD-BizOne.md và bizone.txt |
