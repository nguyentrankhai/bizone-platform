# URD - User Requirements Document

## Payment Hub - Hệ thống Trung gian Thanh toán Tập trung

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne Payment Hub - Payment Gateway Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 12/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Tài liệu này mô tả chi tiết các yêu cầu người dùng (User Requirements) cho hệ thống **Payment Hub** - nền tảng trung gian xử lý thanh toán tập trung của hệ sinh thái BizOne. Tài liệu tập trung vào góc nhìn người dùng cuối: các tác nhân tương tác với hệ thống, luồng nghiệp vụ thanh toán, và kỳ vọng từ hệ thống.

### 1.2. Đối tượng đọc

- Nhóm phát triển (Developers)
- Nhóm kiểm thử (QA/QC)
- Nhóm thiết kế UI/UX
- Quản lý sản phẩm (Product Owner)
- Đối tác thanh toán (Payment Partners)
- Đội ngũ vận hành (Operations)

### 1.3. Phạm vi

Tài liệu này bao gồm toàn bộ các chức năng của Payment Hub: quản lý giao dịch tập trung, API thanh toán & sinh QR, kết nối đối tác thanh toán (VNPay, MoMo, ZaloPay,...), xử lý kết quả thanh toán real-time, webhook/callback, quản lý vòng đời giao dịch, hoàn tiền, đối soát tự động, dashboard và báo cáo vận hành.

### 1.4. Tài liệu tham khảo

| Tài liệu | Mô tả |
|----------|-------|
| BRD-BizOne.md | Business Requirements Document |
| URD-BizOne.md | User Requirements Document - BizOne |
| SRS-BizOne.md | Software Requirements Specification |
| payment-hub.txt | Danh sách tính năng Payment Hub |

---

## 2. Người dùng mục tiêu & Personas

### 2.1. Phân loại người dùng

| Nhóm | Vai trò | Mục tiêu chính |
|------|---------|----------------|
| System Admin | Quản trị viên hệ thống thanh toán | Cấu hình đối tác, quản lý giao dịch, giám sát vận hành |
| BizOne Owner | Chủ doanh nghiệp sử dụng Payment Hub | Theo dõi dòng tiền, đối soát doanh thu, báo cáo thanh toán |
| Developer (Tích hợp) | Lập trình viên tích hợp API thanh toán | Tích hợp API tạo giao dịch, nhận webhook, xử lý kết quả |
| Operations Staff | Nhân viên vận hành | Xử lý tra soát giao dịch, thực hiện hoàn tiền, kiểm tra đối soát |
| Partner Manager | Quản lý đối tác thanh toán | Quản lý kết nối đối tác, theo dõi hiệu suất, xử lý sự cố |

### 2.2. Personas chi tiết

#### Persona 1: Anh Tuấn (System Admin)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 32 |
| Nghề nghiệp | Quản trị viên hệ thống thanh toán |
| Kỹ năng CNTT | Cao, thành thạo API, Linux, database |
| Mục tiêu | Đảm bảo hệ thống thanh toán vận hành ổn định 24/7, cấu hình đối tác mới nhanh chóng |
| Nỗi đau | Không biết giao dịch nào đang bị lỗi; mất nhiều thời gian debug khi đối tác trả kết quả sai; khó khăn khi thêm đối tác mới |
| Kỳ vọng | Dashboard real-time, audit log đầy đủ, kiến trúc Connector để dễ dàng mở rộng |

**Use Cases chính:**
- Cấu hình đối tác thanh toán (thêm/sửa/vô hiệu hóa)
- Xem dashboard giám sát giao dịch real-time
- Quản lý audit log và nhật ký giao dịch
- Cấu hình webhook/callback cho BizOne
- Cấu hình Connector cho đối tác mới

#### Persona 2: Chị Hà (BizOne Owner / Chủ doanh nghiệp)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 35 |
| Nghề nghiệp | Chủ chuỗi cửa hàng bán lẻ |
| Kỹ năng CNTT | Cơ bản, sử dụng được web |
| Mục tiêu | Theo dõi doanh thu thanh toán, đối soát cuối ngày, biết được tỷ lệ giao dịch thành công/thất bại |
| Nỗi đau | Không biết có bao nhiêu tiền đã được thanh toán; không rõ giao dịch nào đang bị treo; phải tự tính toán đối soát thủ công |
| Kỳ vọng | Báo cáo doanh thu thanh toán tự động, biểu đồ trực quan, xuất báo cáo nhanh |

**Use Cases chính:**
- Xem báo cáo doanh thu thanh toán theo ngày/tuần/tháng
- Xem tỷ lệ giao dịch thành công/thất bại
- Xuất báo cáo đối soát
- Xem dashboard tổng quan thanh toán

#### Persona 3: Anh Khoa (Developer tích hợp)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 28 |
| Nghề nghiệp | Lập trình viên Backend |
| Kỹ năng CNTT | Cao, thành thạo REST API, webhook |
| Mục tiêu | Tích hợp API Payment Hub nhanh chóng, tài liệu rõ ràng, test dễ dàng |
| Nỗi đau | API không rõ ràng; thiếu môi trường test (sandbox); webhook không gửi lại được (retry) |
| Kỳ vọng | API documentation đầy đủ, sandbox environment, webhook retry tự động, response mẫu |

**Use Cases chính:**
- Tạo giao dịch thanh toán qua API
- Sinh QR thanh toán (VietQR, Napas QR)
- Nhận webhook kết quả thanh toán
- Tra cứu trạng thái giao dịch
- Gọi API hoàn tiền (Refund)

#### Persona 4: Chị Mai (Operations Staff)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 27 |
| Nghề nghiệp | Nhân viên vận hành thanh toán |
| Kỹ năng CNTT | Trung bình, thành thạo Excel |
| Mục tiêu | Xử lý tra soát giao dịch nhanh, thực hiện hoàn tiền chính xác, đối soát cuối ngày |
| Nỗi đau | Giao dịch lỗi không rõ nguyên nhân; hoàn tiền thủ công mất thời gian; đối soát sai lệch không biết do đâu |
| Kỳ vọng | Công cụ tra soát giao dịch trực quan, hoàn tiền tự động, đối soát tự động kèm báo cáo chênh lệch |

**Use Cases chính:**
- Tra cứu giao dịch theo nhiều tiêu chí
- Thực hiện hoàn tiền toàn phần/một phần
- Xem báo cáo đối soát tự động
- Tra soát giao dịch lỗi
- Xuất báo cáo giao dịch ra Excel

---

## 3. Yêu cầu chức năng theo góc nhìn người dùng

### 3.1. Module Quản lý Đối tác Thanh toán

#### UC-PARTNER-01: Cấu hình đối tác thanh toán

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | System Admin cấu hình thông tin kết nối các đối tác thanh toán |
| **Tác nhân** | System Admin |
| **Tiền điều kiện** | Đã có tài khoản đối tác (VNPay, MoMo, ZaloPay,...) |
| **Hậu điều kiện** | Đối tác được kích hoạt, sẵn sàng nhận giao dịch |

**Luồng chính:**
1. Người dùng vào "Payment Hub" → "Đối tác thanh toán"
2. Hệ thống hiển thị danh sách đối tác đã cấu hình (có sẵn các đối tác mặc định)
3. Người dùng chọn "Thêm đối tác" hoặc chọn đối tác có sẵn để cấu hình
4. Nhập thông tin kết nối:
   - Loại Connector (VNPay, MoMo, ZaloPay, VietQR, ...)
   - API Key / Secret Key / Merchant Code
   - Endpoint (Sandbox / Production)
   - Cấu hình callback URL (nếu có)
   - Cấu hình webhook nhận kết quả
   - Cấu hình timeout, retry policy
5. Chọn "Test kết nối" → Hệ thống gửi request test đến đối tác
6. Nếu kết nối thành công, cho phép kích hoạt
7. Lưu cấu hình

**Yêu cầu:**
- Danh sách đối tác hiển thị trạng thái (Hoạt động / Ngưng / Lỗi kết nối)
- Hỗ trợ cấu hình nhiều môi trường (Sandbox / Production)
- Log lịch sử thay đổi cấu hình

#### UC-PARTNER-02: Quản lý Connector mở rộng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | System Admin thêm Connector mới để tích hợp đối tác thanh toán chưa có sẵn |
| **Tác nhân** | System Admin |
| **Tiền điều kiện** | Có tài liệu API của đối tác mới |

**Luồng chính:**
1. Người dùng vào "Payment Hub" → "Connector"
2. Hệ thống hiển thị danh sách Connector có sẵn (các module plugin)
3. Người dùng có thể:
   - Upload Connector plugin mới (theo định dạng chuẩn)
   - Cấu hình tham số Connector
   - Kích hoạt / vô hiệu hóa Connector
4. Hệ thống kiểm tra tính tương thích của Connector
5. Connector được đăng ký và sẵn sàng sử dụng

**Yêu cầu:**
- Connector tuân theo kiến trúc plugin chuẩn (Interface/Contract định nghĩa trước)
- Hỗ trợ hot-plug (thêm/kích hoạt mà không cần restart hệ thống)
- Tài liệu hướng dẫn phát triển Connector dành cho bên thứ ba

---

### 3.2. Module Quản lý Giao dịch

#### UC-TXN-01: Tạo giao dịch thanh toán (qua API)

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống BizOne hoặc bên thứ ba gọi API tạo giao dịch thanh toán |
| **Tác nhân** | BizOne System (qua API), Developer (qua API) |
| **Tiền điều kiện** | Đã có Merchant ID hợp lệ, API key hợp lệ |
| **Hậu điều kiện** | Giao dịch được tạo với trạng thái Created, chờ xử lý |

**Luồng chính:**
1. Hệ thống gửi request tạo giao dịch với thông tin:
   - Mã giao dịch (Merchant Transaction ID)
   - Số tiền
   - Loại tiền tệ
   - Mô tả / Nội dung thanh toán
   - Phương thức thanh toán mong muốn (hoặc để trống để hiển thị danh sách)
   - Return URL (sau khi thanh toán xong)
   - Webhook URL (nhận kết quả bất đồng bộ)
   - Thông tin khách hàng (tên, email, SĐT)
   - Thông tin bổ sung (metadata)
2. Hệ thống kiểm tra và validate thông tin
3. Hệ thống kiểm tra Merchant ID, API key, hạn mức
4. Hệ thống tạo giao dịch với trạng thái Created
5. Trả về Transaction ID nội bộ
6. Trả về URL thanh toán / QR Code (tùy phương thức)

**Yêu cầu:**
- API hỗ trợ RESTful, JSON
- Xác thực qua API Key + Secret (HMAC Signature)
- Response trong < 500ms
- Mã giao dịch tự động chống trùng lặp (idempotency)

#### UC-TXN-02: Sinh QR thanh toán

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống sinh QR thanh toán (VietQR / Napas QR) cho giao dịch |
| **Tác nhân** | BizOne POS, BizOne Website (qua API) |

**Luồng chính:**
1. Hệ thống gọi API sinh QR với thông tin giao dịch
2. Hệ thống xác định loại QR:
   - **VietQR**: Sinh QR theo chuẩn VietQR (dịch vụ Napas)
   - **Napas QR**: Sinh QR theo chuẩn Napas
   - **QR đối tác**: MoMo QR, ZaloPay QR (nếu có tích hợp)
3. Hệ thống trả về:
   - Base64 image của QR Code
   - URL của QR Code
   - Nội dung QR (raw data)
4. QR Code được hiển thị cho khách hàng trên màn hình POS

**Yêu cầu:**
- QR tuân thủ chuẩn VietQR (EMV Co - VietQR)
- QR có hạn sử dụng (timeout) có thể cấu hình
- Hỗ trợ các kích thước QR khác nhau (200x200, 300x300, 500x500)
- Tự động refresh khi QR hết hạn

#### UC-TXN-03: Xử lý kết quả thanh toán

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống nhận và xử lý kết quả thanh toán từ đối tác |
| **Tác nhân** | Hệ thống (tự động) |

**Luồng chính:**
1. Đối tác thanh toán gửi kết quả thanh toán (IPN / Redirect / Webhook)
2. Hệ thống xác thực chữ ký từ đối tác
3. Hệ thống cập nhật trạng thái giao dịch:
   - Payment Success → trạng thái `Success`
   - Payment Failed → trạng thái `Failed`
4. Hệ thống kiểm tra tính hợp lệ: số tiền khớp, giao dịch tồn tại
5. Hệ thống ghi log kết quả
6. Hệ thống gửi webhook/callback đến BizOne (hoặc bên thứ ba)
7. Hệ thống gửi thông báo real-time cho người dùng (nếu cần)

**Xử lý IPN (Instant Payment Notification):**
- Xác thực chữ ký HMAC/RSA từ đối tác
- Kiểm tra checksum dữ liệu
- Response HTTP 200 OK ngay lập tức để xác nhận đã nhận
- Xử lý bất đồng bộ sau khi response
- Retry tối đa 3 lần nếu xử lý thất bại

**Xử lý Redirect (khách hàng quay lại):**
- Kiểm tra tham số trên URL
- Cập nhật trạng thái giao dịch
- Chuyển hướng đến Return URL của merchant

#### UC-TXN-04: Tra cứu giao dịch

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Tra cứu thông tin chi tiết giao dịch thanh toán |
| **Tác nhân** | Operations Staff, System Admin, Developer |

**Luồng chính:**
1. Người dùng vào "Payment Hub" → "Giao dịch"
2. Hệ thống hiển thị danh sách giao dịch với các bộ lọc:
   - Khoảng thời gian (Hôm nay, Hôm qua, 7 ngày, Tháng này, Tùy chọn)
   - Trạng thái (Created, Pending, Success, Failed, Expired, Refunded)
   - Đối tác thanh toán (VNPay, MoMo, ZaloPay, ...)
   - Merchant/Nguồn gốc (BizOne POS, BizOne Online, ...)
   - Khoảng tiền (từ - đến)
   - Mã giao dịch / Mã đơn hàng
3. Hệ thống hiển thị danh sách dạng bảng với các cột:
   - Mã giao dịch, Thời gian, Số tiền, Phương thức, Trạng thái (màu sắc), Đối tác, Nguồn
4. Click vào giao dịch → xem chi tiết:
   - Thông tin cơ bản: mã GD, số tiền, mô tả, trạng thái
   - Thông tin thanh toán: phương thức, đối tác, thời gian thanh toán
   - Thông tin khách hàng: tên, email, SĐT
   - Log giao dịch: lịch sử thay đổi trạng thái
   - Dữ liệu raw từ đối tác (dành cho debug)
   - Nút "Hoàn tiền" (nếu trạng thái là Success)
   - Nút "Tra soát" (nếu trạng thái lỗi)

**Yêu cầu:**
- Phân trang
- Xuất danh sách giao dịch ra Excel/CSV
- Hiển thị trạng thái bằng màu sắc (xanh - Success, đỏ - Failed, vàng - Pending, xám - Expired)
- Cho phép xem dữ liệu raw request/response từ đối tác

#### UC-TXN-05: Quản lý vòng đời giao dịch

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống tự động quản lý trạng thái giao dịch qua các giai đoạn |
| **Tác nhân** | Hệ thống (tự động) |

**Vòng đời giao dịch chuẩn:**

```
Created
   │
   ▼
Pending ───→ Success
   │            │
   ├──→ Failed  ├──→ Refunded (toàn phần)
   │            └──→ Refunded (một phần)
   │
   └──→ Expired
```

| Trạng thái | Mô tả |
|------------|-------|
| Created | Giao dịch vừa được tạo, chưa có tương tác thanh toán |
| Pending | Khách hàng đang thực hiện thanh toán, chờ kết quả từ đối tác |
| Success | Thanh toán thành công, tiền đã được ghi nhận |
| Failed | Thanh toán thất bại (số dư không đủ, sai thông tin, hủy bỏ) |
| Expired | Giao dịch hết hạn (quá thời gian cho phép) |
| Refunded | Đã hoàn tiền (toàn phần hoặc một phần) |

**Yêu cầu:**
- Tự động chuyển trạng thái khi nhận kết quả từ đối tác
- Tự động expire giao dịch quá hạn (scheduled job)
- Ghi log mỗi lần thay đổi trạng thái (kèm timestamp, lý do)
- Không cho phép thay đổi trạng thái thủ công (trừ refund)

---

### 3.3. Module Hoàn tiền (Refund)

#### UC-REFUND-01: Hoàn tiền toàn phần

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Operations Staff thực hiện hoàn tiền toàn bộ giao dịch |
| **Tác nhân** | Operations Staff, System Admin |
| **Tiền điều kiện** | Giao dịch ở trạng thái Success; đối tác hỗ trợ refund |
| **Hậu điều kiện** | Giao dịch chuyển sang trạng thái Refunded |

**Luồng chính:**
1. Người dùng vào chi tiết giao dịch → chọn "Hoàn tiền"
2. Hệ thống hiển thị thông tin giao dịch gốc
3. Người dùng chọn "Hoàn tiền toàn phần"
4. Hệ thống kiểm tra: đối tác có hỗ trợ refund không, thời gian cho phép refund
5. Người dùng nhập lý do hoàn tiền
6. Hệ thống gửi request refund đến đối tác thanh toán
7. Đối tác xác nhận → hệ thống cập nhật trạng thái Refunded
8. Hệ thống gửi webhook thông báo hoàn tiền đến BizOne
9. Ghi log hoàn tiền

#### UC-REFUND-02: Hoàn tiền một phần

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Operations Staff thực hiện hoàn tiền một phần giao dịch |
| **Tác nhân** | Operations Staff, System Admin |
| **Tiền điều kiện** | Giao dịch Success; đối tác hỗ trợ partial refund |

**Luồng chính:**
1. Người dùng vào chi tiết giao dịch → chọn "Hoàn tiền"
2. Chọn "Hoàn tiền một phần"
3. Nhập số tiền cần hoàn (<= tổng số tiền giao dịch)
4. Nhập lý do hoàn tiền
5. Hệ thống gửi request partial refund đến đối tác
6. Đối tác xác nhận → hệ thống cập nhật:
   - Số tiền đã hoàn (accumulated)
   - Trạng thái Refunded (nếu đã hoàn hết) hoặc vẫn Success (nếu còn dư)
7. Lưu lịch sử các lần hoàn tiền

**Yêu cầu:**
- Mỗi giao dịch có thể hoàn tiền nhiều lần (partial refund)
- Hiển thị tổng số tiền đã hoàn so với số tiền gốc
- Kiểm tra số tiền hoàn không vượt quá số tiền gốc còn lại
- Hỗ trợ tra cứu lịch sử hoàn tiền

---

### 3.4. Module Webhook / Callback

#### UC-WEBHOOK-01: Quản lý Webhook

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Cấu hình và quản lý webhook gửi kết quả thanh toán đến BizOne |
| **Tác nhân** | System Admin, Developer |

**Luồng chính:**
1. Người dùng vào "Payment Hub" → "Webhook"
2. Hệ thống hiển thị danh sách webhook endpoints đã cấu hình
3. Người dùng có thể:
   - **Thêm endpoint mới**: nhập URL, secret key, chọn sự kiện (payment.success, payment.failed, refund.completed)
   - **Sửa**: thay đổi URL, vô hiệu hóa tạm thời
   - **Xóa**: xóa endpoint
4. Hệ thống gửi webhook test (ping) để kiểm tra kết nối

**Yêu cầu:**
- Webhook gửi dưới dạng HTTP POST với JSON body
- Chữ ký HMAC-SHA256 (signature trong header `X-Signature`)
- Retry tối đa 5 lần nếu thất bại (exponential backoff: 1ph, 5ph, 15ph, 1h, 6h)
- Dashboard theo dõi: số lần gửi, thành công, thất bại, thời gian phản hồi
- Cho phép gửi lại (replay) webhook thủ công

#### UC-WEBHOOK-02: Lịch sử Webhook

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Xem lịch sử gửi webhook và trạng thái |
| **Tác nhân** | System Admin, Operations Staff |

**Yêu cầu:**
- Hiển thị danh sách webhook đã gửi (thời gian, endpoint, nội dung, HTTP status, thành công/thất bại)
- Xem chi tiết request/response raw
- Gửi lại (replay) webhook bất kỳ
- Lọc theo: thời gian, trạng thái (success/failed), endpoint

---

### 3.5. Module Đối soát & Tra soát

#### UC-RECON-01: Đối soát giao dịch tự động

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống tự động đối soát giao dịch giữa Payment Hub và đối tác |
| **Tác nhân** | Hệ thống (tự động), Operations Staff |

**Luồng chính:**
1. Hệ thống tự động chạy đối soát định kỳ (hàng ngày vào 00:00)
2. Lấy báo cáo giao dịch từ đối tác (qua API hoặc file CSV)
3. So khớp với giao dịch trong Payment Hub:
   - Khớp: giao dịch tồn tại ở cả 2 bên, số tiền khớp
   - Lệch: giao dịch chỉ có ở 1 bên, hoặc số tiền không khớp
4. Hệ thống tạo báo cáo đối soát:
   - Tổng số giao dịch: Payment Hub / Đối tác
   - Tổng số tiền: Payment Hub / Đối tác
   - Danh sách giao dịch khớp
   - Danh sách giao dịch lệch (chỉ có ở 1 bên)
   - Danh sách giao dịch sai số tiền
5. Gửi thông báo nếu có chênh lệch
6. Operations Staff xem và xử lý các giao dịch lệch

**Yêu cầu:**
- Đối soát hỗ trợ nhiều định dạng (API, CSV, Excel)
- Cảnh báo ngay khi phát hiện chênh lệch
- Xuất báo cáo đối soát ra Excel/PDF
- Lưu lịch sử đối soát theo ngày

#### UC-RECON-02: Tra soát giao dịch

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Tra soát giao dịch khi có khiếu nại hoặc nghi ngờ sai sót |
| **Tác nhân** | Operations Staff, System Admin |

**Luồng chính:**
1. Người dùng vào chi tiết giao dịch → chọn "Tra soát"
2. Hệ thống hiển thị thông tin giao dịch đầy đủ
3. Người dùng nhập nội dung tra soát, lý do
4. Hệ thống ghi nhận yêu cầu tra soát
5. (Tùy chọn) Hệ thống tự động gửi yêu cầu tra soát đến đối tác nếu có API
6. Theo dõi trạng thái tra soát (Đang xử lý / Đã giải quyết)
7. Cập nhật kết quả tra soát

**Yêu cầu:**
- Mỗi giao dịch có thể có nhiều yêu cầu tra soát
- Hiển thị đầy đủ log giao dịch phục vụ tra soát
- Cho phép đính kèm file (chứng từ, hình ảnh)
- Gửi thông báo khi có kết quả tra soát

---

### 3.6. Module Dashboard & Báo cáo

#### UC-DASH-01: Dashboard tổng quan thanh toán

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Dashboard hiển thị các chỉ số thanh toán chính |
| **Tác nhân** | System Admin, BizOne Owner, Operations Staff |

**Yêu cầu hiển thị:**
- **Top bar**: Tổng giao dịch hôm nay, Tổng số tiền, Số GD thành công, Số GD thất bại (real-time)
- **Biểu đồ giao dịch 7 ngày** (dạng line/bar): số lượng GD và tổng tiền
- **Biểu đồ tròn phương thức thanh toán** (VNPay, MoMo, ZaloPay, QR...)
- **Biểu đồ tỷ lệ thành công/thất bại**
- **Danh sách giao dịch gần đây** (10 GD gần nhất)
- **Top nhân hàng chấp nhận thanh toán thành công**
- **Cảnh báo**: giao dịch lỗi nhiều bất thường, webhook thất bại nhiều

**Yêu cầu kỹ thuật:**
- Cập nhật real-time (WebSocket)
- Cho phép chọn khoảng thời gian (Hôm nay, 7 ngày, 30 ngày)

#### UC-RPT-01: Báo cáo giao dịch

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Báo cáo chi tiết giao dịch thanh toán |
| **Tác nhân** | BizOne Owner, Operations Staff, System Admin |

**Yêu cầu:**
- Bộ lọc: thời gian, trạng thái, đối tác, phương thức, merchant
- Hiển thị: tổng số GD, tổng số tiền, phí giao dịch (nếu có), số GD thành công, số GD thất bại
- Biểu đồ theo ngày
- Xuất Excel/PDF/CSV

#### UC-RPT-02: Báo cáo doanh thu

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Báo cáo doanh thu thanh toán theo đối tác và phương thức |
| **Tác nhân** | BizOne Owner, System Admin |

**Yêu cầu:**
- Doanh thu theo từng đối tác thanh toán
- Doanh thu theo từng phương thức
- So sánh cùng kỳ
- Biểu đồ tăng trưởng
- Chi tiết phí giao dịch (nếu applicable)

#### UC-RPT-03: Báo cáo đối soát

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Báo cáo kết quả đối soát tự động |
| **Tác nhân** | Operations Staff, System Admin |

**Yêu cầu:**
- Hiển thị kết quả đối soát theo ngày
- Tổng hợp: tổng GD khớp, tổng GD lệch, tổng chênh lệch tiền
- Chi tiết từng giao dịch lệch kèm trạng thái xử lý
- Xuất báo cáo đối soát ra Excel

---

### 3.7. Module Audit Log & Bảo mật

#### UC-AUDIT-01: Nhật ký giao dịch (Transaction Log)

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Ghi lại toàn bộ sự kiện trong vòng đời giao dịch |
| **Tác nhân** | System Admin, Operations Staff (xem) |

**Yêu cầu:**
- Các sự kiện được ghi log:
  - Tạo giao dịch
  - Thay đổi trạng thái
  - Request/Response API đến đối tác
  - Nhận kết quả thanh toán (IPN/Webhook từ đối tác)
  - Gửi webhook đến BizOne
  - Thực hiện hoàn tiền
  - Tra soát
- Mỗi log ghi: thời gian, sự kiện, dữ liệu request/response, kết quả
- Log không thể xóa hoặc chỉnh sửa (append-only)
- Lưu tối thiểu 90 ngày, có thể lưu lâu hơn (tùy cấu hình)

#### UC-AUDIT-02: Audit Log hệ thống

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Ghi lại thao tác quản trị trên hệ thống Payment Hub |
| **Tác nhân** | System Admin (xem) |

**Yêu cầu:**
- Các thao tác được ghi log:
  - Thay đổi cấu hình đối tác
  - Thêm/sửa Connector
  - Thay đổi cấu hình webhook
  - Người dùng đăng nhập/đăng xuất
  - Thực hiện hoàn tiền thủ công
- Mỗi log ghi: thời gian, người thực hiện, IP, nội dung, dữ liệu cũ/mới
- Lưu tối thiểu 90 ngày

---

## 4. Yêu cầu giao diện người dùng (UI/UX)

### 4.1. Nguyên tắc thiết kế chung

- **Trực quan, dễ sử dụng**: Operations Staff với kỹ năng CNTT trung bình có thể sử dụng được ngay
- **Tập trung vào dữ liệu**: Dashboard và danh sách hiển thị số liệu rõ ràng, dễ đọc
- **Real-time**: Trạng thái giao dịch, số liệu dashboard cập nhật real-time
- **Tra cứu linh hoạt**: Bộ lọc mạnh mẽ cho mọi danh sách
- **Debug-friendly**: Operations Staff có thể xem dữ liệu raw request/response để tra soát

### 4.2. Bảng màu & Typography

| Thành phần | Giá trị |
|------------|---------|
| **Màu chính (Primary)** | Xanh dương (#2563EB) |
| **Màu thành công** | Xanh lá (#10B981) |
| **Màu cảnh báo** | Vàng cam (#F59E0B) |
| **Màu lỗi** | Đỏ (#EF4444) |
| **Màu thông tin** | Xanh lam (#3B82F6) |
| **Font chữ** | Inter (Web), SF Pro (macOS) |
| **Cỡ chữ** | 14px (body), 16px (heading), 20px+ (số tiền dashboard) |

### 4.3. Cấu trúc giao diện tổng thể

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

### 4.4. Màn hình chi tiết giao dịch

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

### 4.5. Các màn hình chính

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

## 5. Yêu cầu tích hợp & API

### 5.1. API thanh toán (dành cho BizOne / bên thứ ba)

| Endpoint | Mô tả | Phương thức |
|----------|-------|-------------|
| `/api/v1/transactions` | Tạo giao dịch thanh toán mới | POST |
| `/api/v1/transactions/{id}` | Tra cứu giao dịch theo ID | GET |
| `/api/v1/transactions/merchant/{merchant_txn_id}` | Tra cứu theo mã GD merchant | GET |
| `/api/v1/transactions/{id}/refund` | Yêu cầu hoàn tiền | POST |
| `/api/v1/qr/generate` | Sinh QR thanh toán | POST |
| `/api/v1/partners` | Danh sách đối tác hỗ trợ | GET |
| `/api/v1/webhook-test` | Gửi webhook test đến BizOne | POST |

**Yêu cầu bảo mật API:**
- Xác thực qua API Key + Secret
- HMAC-SHA256 signature trong header
- Rate limiting (100 req/min)
- IP whitelist (tùy chọn)
- Request/Response đều được log

### 5.2. Webhook từ Payment Hub đến BizOne

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

### 5.3. Tích hợp đối tác thanh toán

| Đối tác | Phương thức tích hợp | Đặc thù |
|---------|---------------------|---------|
| **VNPay** | API + IPN + Redirect | Cổng thanh toán online, hỗ trợ QR, ATM, Visa/Master |
| **MoMo** | API + Webhook | Ví điện tử, MoMo QR |
| **ZaloPay** | API + Callback | Ví điện tử, ZaloPay QR |
| **VietQR** | Chuẩn EMVCo - VietQR | Sinh QR theo chuẩn Napas, khách hàng quét bằng app ngân hàng |
| **Napas QR** | Chuẩn Napas | Tương tự VietQR, hỗ trợ tất cả ngân hàng |

### 5.4. Kiến trúc Connector

```
┌──────────────────────────────────────────────────────────┐
│                    Payment Hub Core                        │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │ Transaction│  │   Route     │  │  Webhook Engine   │  │
│  │  Engine    │  │   Engine    │  │  (Gửi callback)   │  │
│  └──────┬─────┘  └──────┬──────┘  └───────────────────┘  │
│         │               │                                  │
│  ┌──────▼───────────────▼──────────────────────────────┐  │
│  │               Connector Layer                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │  VNPay   │ │   MoMo   │ │ ZaloPay  │ │ Custom │ │  │
│  │  │Connector │ │Connector │ │Connector │ │Connector│ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│         │               │                                  │
│  ┌──────▼───────────────▼──────────────────────────────┐  │
│  │               External Partners                       │  │
│  │    VNPay API     MoMo API     ZaloPay API   ...     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Yêu cầu Connector:**
- Mỗi Connector là một module độc lập, implement interface chuẩn
- Các phương thức bắt buộc: `createTransaction`, `processResult`, `refund`, `verifySignature`
- Connector có thể được thêm/xóa/kích hoạt/vô hiệu hóa mà không ảnh hưởng core
- Connector lưu cấu hình riêng (API key, endpoint, ...)

---

## 6. Quy trình & Luồng nghiệp vụ

### 6.1. Luồng thanh toán hoàn chỉnh

```
Khách hàng chọn thanh toán trên POS / Website
        │
        ▼
BizOne gọi Payment Hub API tạo giao dịch
        │
        ▼
Payment Hub tạo giao dịch (Created)
        │
        ▼
Payment Hub trả về QR Code / URL thanh toán
        │
        ▼
Khách hàng quét QR / Click URL
        │
        ▼
Chuyển hướng đến cổng thanh toán đối tác
        │
        ▼
    ┌───┴──────────────────────────────────────┐
    │                                          │
    ▼                                          ▼
Khách thanh toán                          Khách hủy / timeout
    │                                          │
    ▼                                          ▼
Đối tác gửi IPN/Webhook                  Hệ thống tự động expire
    │                                          │
    ▼                                          ▼
Payment Hub nhận kết quả                  Giao dịch → Expired
    │
    ├── Xác thực chữ ký
    ├── Kiểm tra số tiền
    └── Cập nhật trạng thái
    │
    ▼
Giao dịch → Success / Failed
    │
    ▼
Payment Hub gửi Webhook đến BizOne
    │
    ▼
BizOne xử lý kết quả thanh toán
    │
    ├── Success: Cập nhật trạng thái đơn hàng
    ├── Failed: Thông báo cho khách
    └── Expired: Hủy giao dịch
```

### 6.2. Luồng đối soát tự động

```
00:00 hàng ngày (scheduled job)
        │
        ▼
Payment Hub lấy báo cáo giao dịch từ đối tác
        │
        ├── API (nếu hỗ trợ)
        └── File CSV/Excel (tải thủ công hoặc tự động)
        │
        ▼
So khớp với giao dịch trong Payment Hub
        │
        ▼
Tạo báo cáo đối soát
        │
        ├── Số GD khớp: OK
        ├── GD lệch: Chỉ có ở 1 bên
        └── GD sai số tiền
        │
        ▼
Có chênh lệch?
        │
        ├── Có → Gửi thông báo → Operations Staff xử lý
        └── Không → Lưu báo cáo, kết thúc
        │
        ▼
Operations Staff tra soát từng GD lệch
        │
        ├── Xác nhận GD hợp lệ → Bỏ qua
        ├── Yêu cầu đối tác kiểm tra → Gửi yêu cầu tra soát
        └── Thực hiện điều chỉnh thủ công
```

### 6.3. Luồng hoàn tiền

```
Operations Staff chọn giao dịch → "Hoàn tiền"
        │
        ▼
Kiểm tra điều kiện
        │
        ├── GD ở trạng thái Success?
        ├── Trong thời gian cho phép refund?
        └── Đối tác hỗ trợ refund?
        │
        ▼
Chọn loại hoàn tiền
        │
        ├── Toàn phần
        └── Một phần → Nhập số tiền
        │
        ▼
Nhập lý do
        │
        ▼
Gửi request refund đến đối tác
        │
        ▼
Đối tác xác nhận?
        │
        ├── Thành công → Cập nhật trạng thái Refunded
        │                   → Gửi webhook đến BizOne
        │                   → Ghi log
        └── Thất bại → Hiển thị lỗi cho Operations Staff
                        → Cho phép thử lại
```

---

## 7. Yêu cầu thông báo

### 7.1. Các loại thông báo

| Loại | Kênh | Đối tượng | Nội dung |
|------|------|-----------|----------|
| Giao dịch thành công | Hệ thống (real-time) | BizOne | "Thanh toán 1,500,000₫ thành công - Mã GD: TXN-XXX" |
| Giao dịch thất bại | Hệ thống (real-time) | BizOne | "Thanh toán 1,500,000₫ thất bại - Lỗi từ VNPay" |
| Webhook thất bại | Hệ thống + Email | Admin | "Webhook đến BizOne thất bại sau 5 lần retry" |
| Đối soát chênh lệch | Hệ thống + Email | Admin, Operations | "Đối soát ngày 12/06: 3 GD lệch, tổng 1,200,000₫" |
| Hoàn tiền hoàn tất | Hệ thống | Operations | "Hoàn tiền 500,000₫ cho GD TXN-XXX thành công" |
| Kết nối đối tác lỗi | Hệ thống + Email | Admin | "Kết nối VNPay thất bại: timeout" |
| Giao dịch đáng ngờ | Hệ thống | Admin | "Phát hiện 10 GD thất bại liên tiếp từ cùng IP" |

### 7.2. Yêu cầu kỹ thuật thông báo

- Thông báo hệ thống: real-time qua WebSocket, hiển thị trong notification center
- Email: gửi qua SMTP, hỗ trợ template
- Notification Center: lưu lịch sử 30 ngày, đánh dấu đã đọc/chưa đọc
- Cho phép cấu hình ngưỡng cảnh báo (ví dụ: chỉ gửi email khi webhook thất bại > 3 lần)

---

## 8. Yêu cầu về dữ liệu

### 8.1. Dữ liệu đầu vào

| Module | Dữ liệu nhập | Định dạng | Validation |
|--------|-------------|-----------|------------|
| Tạo giao dịch | Merchant ID, số tiền, mô tả, return URL, webhook URL | JSON | Số tiền > 0, URL hợp lệ |
| Cấu hình đối tác | API Key, Secret Key, Endpoint, Merchant Code | Text | Kiểm tra kết nối trước khi lưu |
| Hoàn tiền | Transaction ID, số tiền, lý do | JSON | Số tiền <= số tiền GD gốc |
| Webhook | URL, Secret, Events | Text, Array | URL hợp lệ, test ping |
| QR sinh | Transaction ID, kích thước, loại QR | JSON | Transaction tồn tại |

### 8.2. Dữ liệu đầu ra

| Module | Dữ liệu xuất | Định dạng |
|--------|-------------|-----------|
| Danh sách giao dịch | Báo cáo giao dịch | Excel, CSV |
| Báo cáo doanh thu | Doanh thu theo đối tác/phương thức | Excel, PDF |
| Báo cáo đối soát | Kết quả đối soát | Excel, PDF |
| QR Code | Hình ảnh QR Code | Base64, PNG, SVG |

### 8.3. Lưu trữ dữ liệu

- Giao dịch thanh toán: lưu vĩnh viễn
- Log request/response API: tối thiểu 90 ngày
- Audit log: tối thiểu 90 ngày

---

## 9. Yêu cầu phi chức năng

### 9.1. Hiệu năng

| Yêu cầu | Mô tả |
|---------|-------|
| Thời gian tạo giao dịch | < 500ms |
| Thời gian sinh QR | < 1 giây |
| Xử lý IPN/Webhook từ đối tác | < 2 giây (từ lúc nhận đến lúc cập nhật trạng thái) |
| Gửi webhook đến BizOne | < 3 giây (từ lúc cập nhật trạng thái thành công đến lúc gửi) |
| Dashboard load | < 3 giây |
| Tra cứu giao dịch | < 2 giây |
| Đối soát 10,000 giao dịch | < 5 phút |

### 9.2. Bảo mật

| Yêu cầu | Mô tả |
|---------|-------|
| Xác thực API | HMAC-SHA256 signature |
| Mã hóa truyền tải | TLS 1.2+ |
| Mã hóa dữ liệu nhạy cảm | API Key, Secret Key được mã hóa trong database |
| IP whitelist | Cho phép giới hạn IP gọi API |
| Rate limiting | 100 req/min cho mỗi API key |
| Audit Log | Append-only, không thể xóa/sửa |

### 9.3. Tính sẵn sàng & Độ tin cậy

| Yêu cầu | Mô tả |
|---------|-------|
| Uptime | 99.9% |
| Xử lý thất bại | Retry tự động (exponential backoff) |
| Webhook retry | Tối đa 5 lần (1ph, 5ph, 15ph, 1h, 6h) |
| Graceful degradation | Khi một đối tác lỗi, không ảnh hưởng đối tác khác |
| Backup | Tự động backup database hàng ngày |

### 9.4. Khả năng mở rộng

| Yêu cầu | Mô tả |
|---------|-------|
| Kiến trúc Connector plugin | Cho phép thêm đối tác mới mà không sửa core |
| Horizontal scaling | Hỗ trợ triển khai nhiều instance |
| Async processing | Xử lý bất đồng bộ cho các tác vụ nặng (đối soát, gửi webhook) |

---

## 10. Tiêu chí chấp nhận

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-TXN-01 | Tạo GD | Tạo giao dịch thành công trong < 500ms |
| AC-TXN-02 | Xử lý IPN | Nhận và xử lý IPN từ đối tác trong < 2 giây |
| AC-TXN-03 | QR sinh | Sinh QR Code trong < 1 giây |
| AC-TXN-04 | Webhook gửi | Webhook gửi đến BizOne trong < 3 giây |
| AC-TXN-05 | Webhook retry | Retry tối đa 5 lần khi thất bại, đúng exponential backoff |
| AC-REF-01 | Hoàn tiền | Hoàn tiền toàn phần/một phần thành công |
| AC-REF-02 | Partial Refund | Cho phép hoàn tiền nhiều lần, tổng không vượt quá số tiền gốc |
| AC-RECON-01 | Đối soát | Đối soát 10,000 GD trong < 5 phút |
| AC-RECON-02 | Phát hiện lệch | Phát hiện chính xác GD lệch giữa 2 bên |
| AC-DASH-01 | Dashboard load | Dashboard tải trong < 3 giây |
| AC-DASH-02 | Real-time | Dashboard cập nhật dữ liệu cách đây tối đa 30 giây |
| AC-SEC-01 | Xác thực API | Request không có signature hợp lệ bị từ chối |
| AC-SEC-02 | Audit Log | Mọi thay đổi trạng thái GD đều được ghi log |
| AC-PARTNER-01 | Connector mới | Thêm Connector mới không yêu cầu restart system |
| AC-PARTNER-02 | Isolation | Một đối tác lỗi không ảnh hưởng đối tác khác |
| AC-NFR-01 | Uptime | Hệ thống đạt 99.9% uptime |

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

### Giai đoạn 2: Mở rộng

| Module | Tính năng |
|--------|-----------|
| MoMo | Tích hợp MoMo QR |
| ZaloPay | Tích hợp ZaloPay |
| Refund | Hoàn tiền toàn phần/một phần qua VNPay, MoMo |
| Đối soát | Đối soát tự động với VNPay, MoMo |
| Báo cáo | Báo cáo giao dịch, doanh thu, đối soát |

### Giai đoạn 3: Tối ưu

| Module | Tính năng |
|--------|-----------|
| Connector | Kiến trúc Connector plugin, cho phép thêm đối tác mới |
| Tra soát | Công cụ tra soát giao dịch, tự động gửi yêu cầu đến đối tác |
| Audit Log | Audit Log đầy đủ cho toàn bộ hệ thống |
| Notification | Thông báo real-time, email cảnh báo |
| Performance | Tối ưu hiệu năng, hỗ trợ scale ngang |

---

## Phụ lục: Thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| Payment Hub | Hệ thống trung gian xử lý thanh toán tập trung |
| IPN | Instant Payment Notification - Thông báo thanh toán tức thời từ đối tác |
| Webhook | Callback HTTP được gửi khi có sự kiện |
| VietQR | Chuẩn QR Code thanh toán liên ngân hàng tại Việt Nam |
| Napas QR | Chuẩn QR Code của Napas (National Payment Corporation of Vietnam) |
| Connector | Module plugin kết nối với đối tác thanh toán |
| HMAC | Hash-based Message Authentication Code - Phương thức xác thực chữ ký |
| Refund | Hoàn tiền cho giao dịch đã thanh toán |
| Reconciliation | Đối soát giao dịch giữa các hệ thống |
| Merchant | Đơn vị chấp nhận thanh toán (BizOne hoặc bên thứ ba) |
| Exponential Backoff | Chiến lược retry với thời gian tăng dần sau mỗi lần thất bại |

---

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án.*

*Version history:*
| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 12/06/2026 | 1.0 | | Tạo mới dựa trên payment-hub.txt |
