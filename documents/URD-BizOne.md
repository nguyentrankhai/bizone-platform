# URD - User Requirements Document

## Phần mềm Quản lý Bán hàng BizOne

| Mục | Thông tin |
|-----|-----------|
| **Tên dự án** | BizOne - Omni Channel POS & Management Platform |
| **Phiên bản** | 1.0 |
| **Ngày** | 11/06/2026 |
| **Trạng thái** | Draft |

---

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Tài liệu này mô tả chi tiết các yêu cầu người dùng (User Requirements) cho hệ thống BizOne - nền tảng quản lý bán hàng All-In-One dành cho các cửa hàng SME. Tài liệu được xây dựng dựa trên BRD (Business Requirements Document) và tập trung vào góc nhìn người dùng cuối: họ cần làm gì, tương tác ra sao, và kỳ vọng gì từ hệ thống.

### 1.2. Đối tượng đọc

- Nhóm phát triển (Developers)
- Nhóm kiểm thử (QA/QC)
- Nhóm thiết kế UI/UX
- Chủ cửa hàng / Quản lý (Stakeholders)
- Đối tác tích hợp (Integration Partners)

### 1.3. Phạm vi

Tài liệu này bao gồm toàn bộ các module của BizOne giai đoạn 1-3 theo roadmap, bao gồm: POS, Quản lý Sản phẩm, Kho hàng, CRM, Đơn hàng, Nhân viên, Báo cáo, Nhà cung cấp, Marketing, Omni Channel, Kế toán cơ bản. Các tính năng nâng cao (giai đoạn 4) chỉ được đề cập ở mức tham khảo.

### 1.4. Tài liệu tham khảo

| Tài liệu | Mô tả |
|----------|-------|
| BRD-BizOne.md | Business Requirements Document |
| Technical Architecture Spec | *(sẽ phát triển sau)* |
| UI/UX Design Kit | *(sẽ phát triển sau)* |

---

## 2. Người dùng mục tiêu & Personas

### 2.1. Phân loại người dùng

Hệ thống phục vụ 5 nhóm người dùng chính:

| Nhóm | Vai trò | Mục tiêu chính |
|------|---------|----------------|
| Admin (Owner) | Chủ cửa hàng/doanh nghiệp | Giám sát tổng thể, kiểm soát lợi nhuận, ra quyết định |
| Manager | Quản lý vận hành | Điều hành hoạt động hàng ngày, quản lý nhân viên |
| Seller | Nhân viên bán hàng | Tạo hóa đơn nhanh, phục vụ khách hàng tại quầy |
| Warehouse Staff | Nhân viên kho | Nhập/xuất/kiểm kê hàng hóa |
| Viewer | Chủ cửa hàng (chế độ xem) | Xem báo cáo, dashboard, không thao tác |

### 2.2. Personas chi tiết

#### Persona 1: Anh Minh (Admin / Chủ cửa hàng)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 35 |
| Nghề nghiệp | Chủ chuỗi 3 cửa hàng thời trang |
| Kỹ năng CNTT | Cơ bản, sử dụng được web và smartphone |
| Mục tiêu | Xem tổng quan doanh thu, lợi nhuận; kiểm soát nhân viên; không cần nhập liệu thủ công |
| Nỗi đau | Không biết cửa hàng nào lời/lỗ; nhân viên có thể gian lận; mất nhiều thời gian tổng hợp báo cáo cuối ngày |
| Kỳ vọng | Dashboard real-time, báo cáo tự động, ứng dụng mobile để xem nhanh |

**Use Cases chính:**
- Xem dashboard tổng quan
- Xem báo cáo doanh thu/lợi nhuận
- Quản lý nhân viên (thêm/xóa/sửa/phân quyền)
- Cấu hình hệ thống (chi nhánh, thuế, đơn vị tiền tệ)
- Xem audit log thao tác nhân viên

#### Persona 2: Chị Lan (Manager / Quản lý)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 28 |
| Nghề nghiệp | Quản lý cửa hàng |
| Kỹ năng CNTT | Trung bình, thành thạo Excel cơ bản |
| Mục tiêu | Quản lý sản phẩm, kho, nhân viên, tạo báo cáo chi tiết |
| Nỗi đau | Phải tự nhập số liệu vào Excel cuối ngày; tồn kho sai lệch; không biết nhân viên nào bán giỏi |
| Kỳ vọng | Báo cáo tự động, tồn kho chính xác, biết được năng suất từng nhân viên |

**Use Cases chính:**
- Quản lý danh mục sản phẩm
- Tạo phiếu nhập kho / kiểm kê
- Tạo báo cáo doanh thu, tồn kho
- Quản lý ca làm việc và chấm công nhân viên
- Quản lý nhà cung cấp và đơn nhập hàng

#### Persona 3: Bạn Tuấn (Seller / Nhân viên bán hàng)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 22 |
| Kỹ năng CNTT | Cơ bản, quen với màn hình cảm ứng |
| Mục tiêu | Tạo hóa đơn thật nhanh, ít thao tác, không sai sót |
| Nỗi đau | Phải nhập tay từng sản phẩm; khách đông phải chờ lâu; không biết khuyến mãi nào đang áp dụng; phải nhập nhiều thông tin khách hàng |
| Kỳ vọng | Quét mã vạch là xong; POS chạy nhanh; khách hàng xem được giỏ hàng trên màn hình riêng |

**Use Cases chính:**
- Tạo hóa đơn bán hàng
- Quét mã vạch sản phẩm
- Chọn khách hàng (nếu có)
- Áp dụng khuyến mãi / mã giảm giá
- Nhận thanh toán (tiền mặt/chuyển khoản/thẻ/ví điện tử)
- In hóa đơn / gửi hóa đơn cho khách
- Đổi trả hàng
- Xem lịch sử mua hàng của khách

#### Persona 4: Bạn Hùng (Warehouse Staff / Nhân viên kho)

| Thông tin | Mô tả |
|-----------|-------|
| Tuổi | 30 |
| Kỹ năng CNTT | Cơ bản |
| Mục tiêu | Nhập/xuất kho chính xác, kiểm kê nhanh |
| Nỗi đau | Hàng nhập về phải ghi chép sổ sách rồi nhập vào máy; kiểm kê mất cả ngày; không biết hàng nào sắp hết |
| Kỳ vọng | Nhập kho bằng quét mã vạch; kiểm kê bằng thiết bị di động; cảnh báo tự động khi hàng sắp hết |

**Use Cases chính:**
- Tạo phiếu nhập kho (từ đơn nhập hàng hoặc nhập trực tiếp)
- Xuất kho (cho đơn hàng, chuyển kho, hủy hàng)
- Kiểm kê kho
- Chuyển kho giữa các chi nhánh
- Xem cảnh báo tồn kho
- Quản lý lô & hạn sử dụng

---

## 3. Yêu cầu chức năng theo góc nhìn người dùng

### 3.1. Module Bán hàng (POS)

#### UC-POS-01: Tạo hóa đơn bán hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Nhân viên bán hàng tạo hóa đơn cho khách tại quầy |
| **Tác nhân** | Seller |
| **Tiền điều kiện** | Nhân viên đã đăng nhập; sản phẩm có tồn kho |
| **Hậu điều kiện** | Hóa đơn được tạo; tồn kho cập nhật; điểm thưởng (nếu có) được cộng |

**Luồng chính:**
1. Người dùng đăng nhập vào POS
2. Hệ thống hiển thị giao diện POS: danh sách sản phẩm (bên trái), giỏ hàng (bên phải)
3. Người dùng thêm sản phẩm vào giỏ bằng một trong các cách:
   - Quét mã vạch bằng máy quét (ưu tiên cao nhất, 1 thao tác)
   - Tìm kiếm sản phẩm bằng từ khóa (gợi ý real-time khi gõ)
   - Chọn từ danh sách/danh mục sản phẩm
4. Hệ thống hiển thị giỏ hàng trên **cả hai màn hình**:
   - Màn hình nhân viên: danh sách sản phẩm kèm số lượng, đơn giá, tổng
   - Màn hình khách hàng: danh sách sản phẩm, tổng tiền, khuyến mãi, QR thanh toán
5. Người dùng có thể:
   - Thay đổi số lượng sản phẩm
   - Xóa sản phẩm khỏi giỏ
   - Áp dụng khuyến mãi / mã giảm giá
   - Thêm ghi chú cho hóa đơn
6. Người dùng chọn phương thức thanh toán
7. Hệ thống hiển thị thông tin thanh toán chi tiết
8. Người dùng xác nhận thanh toán
9. Hệ thống tạo hóa đơn, cập nhật tồn kho, điểm thưởng, doanh số
10. Người dùng chọn: in hóa đơn, gửi email/SMS, hoặc bỏ qua

**Luồng thay thế:**
- **Hết hàng khi thêm**: Hệ thống cảnh báo tồn kho không đủ, cho phép thêm ghi chú "thiếu hàng"
- **Khách hàng thân thiết**: Người dùng có thể tìm/chọn khách hàng để tích điểm
- **Nhiều phương thức thanh toán**: Cho phép thanh toán hỗn hợp (ví dụ: 50% tiền mặt + 50% chuyển khoản)

#### UC-POS-02: Đổi trả hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Xử lý yêu cầu đổi hoặc trả hàng của khách |
| **Tác nhân** | Seller, Manager |
| **Tiền điều kiện** | Có hóa đơn gốc trong hệ thống |
| **Hậu điều kiện** | Phiếu đổi/trả được tạo; tồn kho cập nhật; công nợ (nếu có) điều chỉnh |

**Luồng chính:**
1. Người dùng chọn chức năng "Đổi trả hàng"
2. Người dùng nhập mã hóa đơn gốc hoặc tìm kiếm
3. Hệ thống hiển thị thông tin hóa đơn gốc
4. Người dùng chọn một trong hai:

   **Trả hàng:**
   - Chọn sản phẩm muốn trả
   - Nhập lý do trả
   - Hệ thống tính tiền hoàn lại (dựa trên chính sách)
   - Chọn phương thức hoàn tiền (tiền mặt/chuyển khoản)
   - Xác nhận → tạo phiếu trả → cập nhật tồn kho

   **Đổi hàng:**
   - Chọn sản phẩm muốn đổi
   - Chọn sản phẩm mới thay thế
   - Hệ thống tính chênh lệch (nếu có)
   - Xác nhận → tạo phiếu đổi → cập nhật tồn kho
5. In/gửi phiếu đổi trả cho khách

#### UC-POS-03: POS 2 màn hình

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống hỗ trợ 2 màn hình vật lý hoặc 2 cửa sổ trình duyệt cho cùng một phiên bán hàng |
| **Tác nhân** | Seller, Customer |
| **Tiền điều kiện** | Hai màn hình được kết nối; phần mềm chạy trên một trong hai chế độ |

**Yêu cầu giao diện màn hình nhân viên (Màn hình 1):**
- Panel trái: Danh sách sản phẩm dạng grid + thanh tìm kiếm + bộ lọc danh mục
- Panel phải: Giỏ hàng hiện tại với số lượng, đơn giá, tổng tiền
- Khu vực dưới cùng: Các nút thanh toán (Tiền mặt, Chuyển khoản, Thẻ, Ví điện tử)
- Hiển thị phím tắt cho các thao tác thường dùng (F1-F12)

**Yêu cầu giao diện màn hình khách hàng (Màn hình 2):**
- Header: Tên cửa hàng, ngày giờ
- Danh sách sản phẩm đã chọn: hình ảnh, tên, số lượng, đơn giá
- Tổng cộng: tạm tính, giảm giá, thành tiền (hiển thị lớn, rõ ràng)
- QR Code thanh toán (nếu khách chọn chuyển khoản/ví điện tử)
- Tin nhắn chào mừng / cảm ơn
- Không có nút thao tác (chỉ hiển thị - presentation mode)
- Tự động refresh real-time khi màn hình nhân viên thay đổi giỏ hàng

**Cơ chế kết nối 2 màn hình:**
- Sử dụng `BroadcastChannel API` hoặc `WebSocket` để đồng bộ real-time
- Hỗ trợ hai tab trình duyệt: một tab POS-Seller, một tab POS-Customer
- Hỗ trợ hai cửa sổ trình duyệt trên 2 màn hình vật lý
- Mã PIN ghép cặp để liên kết hai màn hình

#### UC-POS-04: Quản lý hóa đơn nhanh

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Nhân viên có thể tạo hóa đơn trong vòng 5-10 giây nhờ các tính năng hỗ trợ |
| **Tác nhân** | Seller |

**Yêu cầu:**
- Tìm kiếm sản phẩm theo mã vạch, SKU, tên sản phẩm (real-time search, < 200ms)
- Lưu danh sách sản phẩm bán nhanh (quick add) để truy cập 1 chạm
- Hỗ trợ barcode scanner (USB/Bluetooth), tự động focus vào ô tìm kiếm khi quét
- Tự động tính giảm giá, khuyến mãi
- Tự động phát hiện khách hàng thân thiết qua số điện thoại (nếu nhập số ĐT)
- Mặc định phương thức thanh toán là tiền mặt (có thể đổi)
- Số lượng mặc định là 1 (có thể thay đổi)

#### UC-POS-05: Khóa ca & Đối soát cuối ca

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Nhân viên kết thúc ca làm việc, hệ thống tổng kết doanh số và đối soát |
| **Tác nhân** | Seller, Manager |
| **Tiền điều kiện** | Ca làm việc đang mở |
| **Hậu điều kiện** | Ca được đóng; doanh số ghi nhận; quỹ tiền mặt đối soát |

**Luồng chính:**
1. Người dùng chọn "Khóa ca"
2. Hệ thống hiển thị tổng kết ca:
   - Tổng số hóa đơn
   - Tổng doanh thu (theo từng phương thức thanh toán)
   - Số tiền mặt trong quỹ
   - Số lượng đổi trả
   - Chênh lệch quỹ (nếu có)
3. Người dùng nhập số tiền mặt thực tế
4. Hệ thống tự động đối soát: chênh lệch = tiền mặt thực tế - tiền mặt hệ thống
5. Nếu chênh lệch ngoài ngưỡng (>20,000đ), yêu cầu người dùng nhập ghi chú giải trình
6. Quản lý xác nhận (hoặc hệ thống ghi nhận để quản lý kiểm tra sau)
7. Ca được đóng

---

### 3.2. Module Quản lý Sản phẩm

#### UC-PROD-01: Quản lý danh mục sản phẩm

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Người dùng quản lý cây danh mục sản phẩm |
| **Tác nhân** | Manager, Admin |

**Luồng chính:**
1. Người dùng vào module "Sản phẩm" → "Danh mục"
2. Hệ thống hiển thị cây danh mục dạng tree (cha - con)
3. Người dùng có thể:
   - **Thêm danh mục**: nhập tên, chọn danh mục cha (nếu có), mô tả, hình ảnh
   - **Sửa danh mục**: thay đổi thông tin danh mục
   - **Xóa danh mục**: chỉ xóa được nếu không có sản phẩm hoặc danh mục con
   - **Sắp xếp**: kéo-thả để sắp xếp thứ tự hiển thị
   - **Ẩn/hiện**: ẩn danh mục không muốn hiển thị trên POS
4. Hỗ trợ tối đa 5 cấp danh mục

**Yêu cầu hiển thị:**
- Dạng tree view có thể mở rộng/thu gọn
- Hiển thị số lượng sản phẩm trong từng danh mục
- Thanh tìm kiếm danh mục

#### UC-PROD-02: Quản lý sản phẩm

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Người dùng thêm mới, sửa, xóa sản phẩm |
| **Tác nhân** | Manager, Admin |

**Luồng chính:**
1. Người dùng vào "Sản phẩm" → "Danh sách sản phẩm"
2. Người dùng chọn "Thêm sản phẩm"
3. Hệ thống hiển thị form nhập liệu với các trường:

   **Thông tin cơ bản (bắt buộc):**
   - Tên sản phẩm
   - Mã SKU (tự động sinh theo rule, có thể sửa)
   - Mã vạch (tùy chọn, có thể quét tự động)
   - Danh mục
   - Đơn vị tính cơ bản (cái, kg, hộp, ...)
   - Giá bán (đã bao gồm VAT hoặc chưa tùy cấu hình)
   - Hình ảnh (tối đa 5 ảnh)
   - Trạng thái (Đang bán / Ngừng bán / Hết hàng)

   **Thông tin mở rộng (tùy chọn):**
   - Giá vốn
   - Mô tả sản phẩm
   - Thuế suất VAT
   - Tồn kho tối thiểu (cảnh báo)
   - Vị trí trong kho (kệ, ngăn)
   - Nhà cung cấp mặc định

   **Đa đơn vị tính:**
   - Ví dụ: Cái (1), Thùng (12 cái), Pallet (144 cái)
   - Mỗi đơn vị có giá riêng, mã vạch riêng

   **Thuộc tính (nếu có):**
   - Màu sắc, kích cỡ, phiên bản
   - Tạo biến thể tự động từ tổ hợp thuộc tính
   - Mỗi biến thể có SKU riêng, tồn kho riêng, giá riêng

4. Người dùng nhập thông tin và lưu
5. Hệ thống kiểm tra trùng SKU/mã vạch → cảnh báo nếu trùng
6. Sản phẩm được tạo

**Yêu cầu danh sách sản phẩm:**
- Hiển thị dạng bảng với các cột: Hình ảnh, Tên, SKU, Danh mục, Giá bán, Giá vốn, Tồn kho, Trạng thái
- Có thể sắp xếp theo từng cột
- Có thể lọc theo: danh mục, trạng thái, nhà cung cấp
- Tìm kiếm: theo tên, SKU, mã vạch
- Phân trang
- Chọn nhiều sản phẩm để thao tác hàng loạt (cập nhật giá, chuyển danh mục, xóa)

#### UC-PROD-03: Quản lý Combo / Gói sản phẩm

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Người dùng tạo combo từ nhiều sản phẩm có sẵn |
| **Tác nhân** | Manager, Admin |

**Luồng chính:**
1. Người dùng vào "Sản phẩm" → "Combo sản phẩm"
2. Chọn "Tạo combo mới"
3. Nhập: Tên combo, mô tả, hình ảnh, giá bán combo
4. Thêm các sản phẩm thành phần (tìm kiếm và chọn)
5. Nhập số lượng từng sản phẩm trong combo
6. Hệ thống tự động tính: tổng giá vốn combo, lợi nhuận
7. Lưu combo
8. Khi bán tại POS, combo hiển thị như một sản phẩm
9. Khi thanh toán, hệ thống tự động trừ tồn kho từng sản phẩm thành phần

#### UC-PROD-04: Import/Export sản phẩm

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Người dùng import danh sách sản phẩm từ file Excel hoặc export ra Excel |
| **Tác nhân** | Manager, Admin |

**Yêu cầu:**
- Hỗ trợ file Excel (.xlsx, .xls)
- Cung cấp file mẫu (template) có sẵn để tải về
- Khi import:
  - Map cột từ file Excel vào các trường trong hệ thống
  - Kiểm tra dữ liệu: SKU trùng, định dạng giá, danh mục có tồn tại
  - Hiển thị kết quả: số dòng thành công, số dòng lỗi kèm lý do
  - Cho phép tải file báo cáo lỗi
- Khi export:
  - Chọn các cột muốn export
  - Chọn bộ lọc (danh mục, trạng thái...)
  - Export ra file Excel

---

### 3.3. Module Quản lý Kho

#### UC-WH-01: Nhập kho

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Nhân viên kho tạo phiếu nhập kho |
| **Tác nhân** | Warehouse Staff, Manager |

**Luồng chính:**
1. Người dùng vào "Kho hàng" → "Nhập kho"
2. Chọn loại nhập kho:
   - **Nhập từ đơn nhập hàng**: chọn đơn nhập hàng có sẵn → tự động điền danh sách sản phẩm
   - **Nhập trực tiếp**: thêm từng sản phẩm
3. Chọn chi nhánh/kho nhập
4. Thêm sản phẩm: quét mã vạch hoặc tìm kiếm
5. Với mỗi sản phẩm, nhập: số lượng, đơn giá nhập, lô (nếu có), HSD (nếu có)
6. Hệ thống hiển thị tổng giá trị phiếu nhập
7. Nhập ghi chú (nếu có)
8. Xác nhận → tạo phiếu nhập → cập nhật tồn kho + giá vốn

**Yêu cầu:**
- Quét mã vạch liên tục để nhập nhiều sản phẩm
- Hỗ trợ nhập số lượng bằng bàn phím số
- Tự động tính thành tiền = số lượng * đơn giá
- Hiển thị tổng số lượng và tổng tiền toàn phiếu

#### UC-WH-02: Kiểm kê kho

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Kiểm kê và đối chiếu tồn kho thực tế với hệ thống |
| **Tác nhân** | Warehouse Staff, Manager |

**Luồng chính:**
1. Người dùng vào "Kho hàng" → "Kiểm kê"
2. Chọn "Tạo phiếu kiểm kê mới"
3. Chọn khu vực/danh mục sản phẩm cần kiểm kê (hoặc toàn bộ)
4. Hệ thống xuất danh sách sản phẩm kèm tồn kho hệ thống
5. Người dùng nhập số lượng thực tế (có thể quét mã vạch từng sản phẩm)
6. Hệ thống tự động tính chênh lệch: thực tế - hệ thống
7. Với sản phẩm có chênh lệch, người dùng nhập ghi chú lý do
8. Xác nhận kiểm kê → hệ thống tự động điều chỉnh tồn kho

**Yêu cầu:**
- Hỗ trợ kiểm kê trên thiết bị di động
- Hỗ trợ kiểm kê offline (đồng bộ khi có mạng)
- Xuất phiếu kiểm kê ra PDF/Excel
- Lưu lịch sử kiểm kê

#### UC-WH-03: Cảnh báo tồn kho

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Hệ thống tự động cảnh báo khi tồn kho dưới ngưỡng hoặc hàng sắp hết hạn |
| **Tác nhân** | Warehouse Staff, Manager |

**Yêu cầu:**
- Admin/Manager cấu hình ngưỡng tồn kho tối thiểu cho từng sản phẩm
- Khi tồn kho <= ngưỡng, hệ thống:
  - Hiển thị badge cảnh báo đỏ trên module Kho
  - Gửi thông báo trên dashboard
  - Gửi email/SMS (tùy cấu hình)
- Cảnh báo hàng sắp hết hạn sử dụng (30 ngày, 14 ngày, 7 ngày trước khi hết hạn)
- Cảnh báo hàng tồn kho lâu (> 90 ngày không có giao dịch)

#### UC-WH-04: Chuyển kho

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Chuyển hàng giữa các chi nhánh/kho |
| **Tác nhân** | Warehouse Staff, Manager |

**Luồng chính:**
1. Người dùng vào "Kho hàng" → "Chuyển kho"
2. Chọn "Tạo phiếu chuyển"
3. Chọn kho nguồn, kho đích
4. Thêm sản phẩm và số lượng cần chuyển
5. Hệ thống kiểm tra tồn kho nguồn
6. Xác nhận → tạo phiếu chuyển (trạng thái: "Chờ chuyển")
7. Kho nguồn xuất hàng → trạng thái "Đang chuyển"
8. Kho đích nhận hàng → xác nhận → trạng thái "Hoàn thành" → cập nhật tồn kho

---

### 3.4. Module CRM

#### UC-CRM-01: Quản lý hồ sơ khách hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Người dùng quản lý thông tin khách hàng |
| **Tác nhân** | Seller, Manager, Admin |

**Thông tin khách hàng:**
- Tên khách hàng (bắt buộc)
- Số điện thoại (bắt buộc - unique)
- Email
- Địa chỉ
- Ngày sinh
- Giới tính
- Ghi chú
- Nhóm khách hàng (Bán buôn, Bán lẻ, VIP, ...)
- Xếp hạng (Silver, Gold, VIP, Diamond)
- Điểm tích lũy
- Tổng chi tiêu
- Số lần mua hàng
- Ngày đăng ký thành viên

**Yêu cầu:**
- Thêm khách hàng: form nhập liệu, có thể thêm nhanh từ POS
- Tìm kiếm: theo tên, số điện thoại, email
- Xem lịch sử mua hàng trong hồ sơ khách hàng
- Chỉnh sửa thông tin
- Hợp nhất 2 khách hàng trùng (merge)
- Xuất danh sách khách hàng ra Excel

#### UC-CRM-02: Tích điểm & Xếp hạng thành viên

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Khách hàng được tích điểm và nâng hạng dựa trên chi tiêu |
| **Tác nhân** | Hệ thống (tự động), Admin (cấu hình) |

**Yêu cầu:**
- Admin cấu hình tỷ lệ tích điểm (ví dụ: 1.000đ = 1 điểm)
- Admin cấu hình hạng thành viên:
  | Hạng | Điều kiện | Đặc quyền |
  |------|-----------|-----------|
  | Silver | Mới đăng ký | 1.000đ = 1 điểm |
  | Gold | Chi tiêu > 5 triệu | 1.000đ = 1.2 điểm, giảm 5% |
  | VIP | Chi tiêu > 20 triệu | 1.000đ = 1.5 điểm, giảm 10% |
  | Diamond | Chi tiêu > 50 triệu | 1.000đ = 2 điểm, giảm 15%, miễn phí vận chuyển |

- Điểm được cộng tự động khi tạo hóa đơn
- Khách hàng có thể dùng điểm để thanh toán (Admin cấu hình tỷ lệ: 1 điểm = ? VND)
- Hạng thành viên được tự động nâng/giảm định kỳ theo tháng/quý
- Nhân viên POS thấy được điểm và hạng của khách khi chọn khách hàng

#### UC-CRM-03: Theo dõi công nợ khách hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Quản lý công nợ phải thu của khách hàng |
| **Tác nhân** | Manager, Admin |

**Luồng chính:**
1. Người dùng vào "CRM" → "Công nợ khách hàng"
2. Hệ thống hiển thị danh sách khách hàng có công nợ
3. Mỗi khách hàng hiển thị: tổng nợ, hạn mức tín dụng, ngày quá hạn
4. Người dùng chọn khách hàng → xem chi tiết:
   - Lịch sử phát sinh công nợ
   - Các hóa đơn chưa thanh toán
   - Lịch sử thanh toán
5. Người dùng ghi nhận thanh toán từ khách:
   - Nhập số tiền thanh toán
   - Chọn phương thức thanh toán
   - Hệ thống tự động giảm công nợ

**Yêu cầu:**
- Cảnh báo khi khách hàng vượt hạn mức tín dụng
- Gửi nhắc nợ tự động (SMS/Email/Zalo)
- In sao kê công nợ cho khách hàng

---

### 3.5. Module Quản lý Đơn hàng

#### UC-ORD-01: Quản lý đơn hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Theo dõi toàn bộ đơn hàng từ tất cả các kênh |
| **Tác nhân** | Manager, Seller |

**Luồng chính:**
1. Người dùng vào "Đơn hàng"
2. Hệ thống hiển thị danh sách đơn hàng với bộ lọc:
   - Kênh: Tại quầy, Online, Website, Shopee, Lazada...
   - Trạng thái: Chờ xác nhận, Đang chuẩn bị, Đang giao, Hoàn thành, Hủy
   - Thời gian: Hôm nay, Tuần này, Tháng này, Tùy chọn
   - Nhân viên tạo đơn
3. Click vào đơn hàng → xem chi tiết: thông tin khách, sản phẩm, thanh toán, ghi chú
4. Với đơn online:
   - Xác nhận đơn
   - Chuyển sang trạng thái "Đang chuẩn bị"
   - Chọn "Đã giao cho vận chuyển"
   - Đánh dấu "Hoàn thành" khi khách nhận
5. Với đơn cần hủy: nhập lý do hủy → hủy đơn → hoàn tồn kho (nếu đã xuất kho)

**Yêu cầu:**
- Hiển thị trạng thái bằng màu sắc (xanh - hoàn thành, đỏ - hủy, vàng - đang xử lý)
- Tìm kiếm đơn hàng: theo mã đơn, tên/SĐT khách hàng
- Xuất danh sách đơn hàng ra Excel

#### UC-ORD-02: Quản lý giao hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Quản lý đơn hàng giao tận nơi |
| **Tác nhân** | Manager, Seller |

**Yêu cầu:**
- Xem danh sách đơn cần giao
- In phiếu giao hàng
- Chọn đơn vị vận chuyển (GHN, GHTK, Shopee Express, tự giao)
- Nhập mã vận đơn (tracking number)
- Theo dõi trạng thái giao hàng (nếu có tích hợp API)
- Cập nhật trạng thái: Đã giao / Giao thất bại (nhập lý do)
- Ghi nhận COD (nếu có)

---

### 3.6. Module Quản lý Nhân viên

#### UC-STAFF-01: Quản lý nhân viên & phân quyền

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Admin quản lý danh sách nhân viên và phân quyền |
| **Tác nhân** | Admin |

**Luồng chính:**
1. Người dùng vào "Nhân viên" → "Danh sách"
2. Thêm nhân viên: nhập họ tên, SĐT, email, vai trò, mật khẩu (hoặc mời qua email)
3. Phân quyền: chọn vai trò (Admin/Manager/Seller/Warehouse/Viewer) hoặc tùy chỉnh từng quyền
4. Cấu hình quyền chi tiết theo module:
   - Sản phẩm: Xem / Thêm / Sửa / Xóa
   - Kho: Xem / Nhập / Xuất / Kiểm kê
   - Đơn hàng: Xem / Xác nhận / Hủy
   - Báo cáo: Xem / Xuất
   - ...
5. Nhân viên được tạo với quyền tương ứng
6. Có thể vô hiệu hóa nhân viên (không xóa) để giữ lịch sử

#### UC-STAFF-02: Ca làm việc & Chấm công

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Quản lý lịch làm việc và chấm công |
| **Tác nhân** | Manager (tạo ca), Seller (check-in/out) |

**Yêu cầu:**
- Manager tạo ca: chọn nhân viên, ngày, giờ bắt đầu, giờ kết thúc
- Lịch làm việc hiển thị dạng calendar/timeline
- Nhân viên check-in khi bắt đầu ca (tại POS hoặc qua giao diện chấm công)
- Nhân viên check-out khi kết thúc ca (kèm tổng kết ca như UC-POS-05)
- Hệ thống tính: giờ làm thực tế, đi trễ, về sớm
- Manager xem bảng chấm công theo tuần/tháng

#### UC-STAFF-03: Hoa hồng nhân viên

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Tính hoa hồng tự động cho nhân viên |
| **Tác nhân** | Admin (cấu hình), Hệ thống (tính) |

**Yêu cầu:**
- Admin cấu hình công thức hoa hồng:
  - Theo % doanh số (ví dụ: 1% tổng doanh số)
  - Theo % lợi nhuận (ví dụ: 5% lợi nhuận)
  - Theo sản phẩm cụ thể (ví dụ: 10.000đ/SP cho sản phẩm A)
  - Kết hợp nhiều công thức
- Hoa hồng được tính tự động cuối tháng
- Hệ thống hiển thị báo cáo hoa hồng: chi tiết từng đơn hàng, từng nhân viên
- Xuất bảng tính hoa hồng ra Excel

#### UC-STAFF-04: Audit Log (Nhật ký thao tác)

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Ghi lại toàn bộ thao tác quan trọng trong hệ thống |
| **Tác nhân** | Admin, Manager (xem) |

**Yêu cầu:**
- Các thao tác được ghi log:
  - Đăng nhập/đăng xuất
  - Tạo/sửa/xóa hóa đơn
  - Đổi trả hàng
  - Thêm/sửa/xóa sản phẩm
  - Nhập/xuất/kiểm kê kho
  - Thêm/sửa/xóa nhân viên
  - Thay đổi cấu hình hệ thống
  - Tạo/sửa/xóa mã giảm giá
- Mỗi log ghi: thời gian, người thực hiện, IP, thiết bị, nội dung thao tác, dữ liệu cũ (nếu sửa), dữ liệu mới
- Log không thể xóa hoặc chỉnh sửa (append-only)
- Admin xem log theo bộ lọc: người dùng, thời gian, loại thao tác
- Lưu log tối thiểu 90 ngày

---

### 3.7. Module Báo cáo & Phân tích

#### UC-RPT-01: Dashboard tổng quan

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Trang tổng quan hiển thị các chỉ số kinh doanh chính |
| **Tác nhân** | Admin, Manager, Viewer |

**Yêu cầu hiển thị:**
- **Top bar**: Doanh thu hôm nay, Đơn hàng hôm nay, Khách hàng mới, Sản phẩm đã bán (số liệu cập nhật real-time)
- **Biểu đồ doanh thu 7 ngày gần nhất** (dạng line hoặc bar)
- **Biểu đồ doanh thu theo giờ trong ngày** (dạng bar)
- **Top 5 sản phẩm bán chạy nhất**
- **Top 3 nhân viên có doanh số cao nhất**
- **Tồn kho cảnh báo** (sắp hết / tồn đọng lâu)
- **Đơn hàng chưa xử lý** (đơn online chờ xác nhận)
- **Biểu đồ tròn phương thức thanh toán** (tiền mặt / chuyển khoản / thẻ / ví điện tử)

**Yêu cầu kỹ thuật:**
- Cập nhật real-time (WebSocket hoặc polling 30 giây/lần)
- Cho phép chọn khoảng thời gian (Hôm nay, Tuần này, Tháng này)
- Responsive trên mọi thiết bị

#### UC-RPT-02: Báo cáo doanh thu

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Báo cáo chi tiết doanh thu |
| **Tác nhân** | Admin, Manager |

**Yêu cầu:**
- Lọc: theo ngày/tuần/tháng/năm, theo chi nhánh, theo nhân viên, theo danh mục
- Hiển thị: doanh thu, chiết khấu, doanh thu thuần
- So sánh cùng kỳ (năm trước, tháng trước)
- Biểu đồ tăng trưởng
- Chi tiết theo từng ngày (khi xem báo cáo tháng)
- Doanh thu theo từng phương thức thanh toán
- Doanh thu theo từng nhóm sản phẩm

#### UC-RPT-03: Báo cáo lợi nhuận

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Báo cáo lợi nhuận chi tiết |
| **Tác nhân** | Admin, Manager |

**Yêu cầu:**
- Tính toán: Lợi nhuận gộp = Doanh thu - Giá vốn hàng bán
- Lọc: theo thời gian, danh mục, sản phẩm, chi nhánh
- Hiển thị: Doanh thu, Giá vốn, Lợi nhuận gộp, Biên lợi nhuận (%)
- Biểu đồ lợi nhuận theo thời gian
- Top sản phẩm có lợi nhuận cao nhất/thấp nhất

#### UC-RPT-04: Báo cáo khác

| Mã | Tên báo cáo | Mô tả |
|----|-------------|-------|
| RPT-04 | Hàng bán chạy/chậm | Top 10 bán chạy, top 10 tồn lâu nhất |
| RPT-05 | Hiệu quả khuyến mãi | So sánh doanh thu trước/sau/trong khuyến mãi |
| RPT-06 | Hiệu quả nhân viên | Doanh số, số đơn, giá trị TB/đơn theo từng nhân viên |
| RPT-07 | Báo cáo tồn kho | Giá trị tồn kho, hàng sắp hết, hàng quá hạn |
| RPT-08 | Báo cáo thu chi | Thu, chi, lợi nhuận ròng |

**Tất cả báo cáo đều hỗ trợ:**
- Lọc: thời gian, chi nhánh, danh mục
- Xuất: PDF, Excel
- In trực tiếp
- Gửi email tự động (cấu hình định kỳ)
- So sánh với kỳ trước

---

### 3.8. Module Quản lý Nhà cung cấp

#### UC-SUP-01: Quản lý nhà cung cấp

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Quản lý danh sách nhà cung cấp |
| **Tác nhân** | Manager, Admin |

**Thông tin nhà cung cấp:**
- Tên nhà cung cấp
- Mã số thuế
- Số điện thoại, Email
- Địa chỉ
- Người liên hệ
- Nhóm hàng cung cấp
- Điều khoản thanh toán
- Công nợ hiện tại
- Ghi chú

**Yêu cầu:**
- Thêm, sửa, xóa nhà cung cấp
- Tìm kiếm: theo tên, SĐT, mã số thuế
- Xem lịch sử giao dịch với từng nhà cung cấp
- So sánh giá nhập giữa các nhà cung cấp cho cùng một sản phẩm

#### UC-SUP-02: Đơn nhập hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Tạo và theo dõi đơn nhập hàng |
| **Tác nhân** | Manager, Admin |

**Luồng chính:**
1. Người dùng vào "Nhà cung cấp" → "Đơn nhập hàng"
2. Chọn "Tạo đơn nhập hàng mới"
3. Chọn nhà cung cấp
4. Thêm sản phẩm: chọn sản phẩm, nhập số lượng, đơn giá nhập
5. Hệ thống hiển thị tổng giá trị đơn nhập
6. Chọn kho nhập
7. Nhập ghi chú, điều khoản thanh toán
8. Lưu đơn (trạng thái: "Chờ nhập")
9. Khi hàng về, chuyển sang bước nhập kho (UC-WH-01)
10. Sau khi nhập kho, trạng thái đơn nhập: "Đã nhập"

**Yêu cầu:**
- Xem lịch sử đơn nhập hàng
- Lọc theo trạng thái: Chờ nhập, Đã nhập một phần, Đã nhập, Đã hủy
- Theo dõi công nợ nhà cung cấp

---

### 3.9. Module Bán hàng Đa kênh (Omni Channel)

#### UC-OMNI-01: Kết nối sàn thương mại điện tử

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Kết nối và đồng bộ với các sàn TMĐT |
| **Tác nhân** | Admin, Manager |

**Luồng chính:**
1. Người dùng vào "Omni Channel" → "Kết nối kênh bán"
2. Chọn kênh cần kết nối (Shopee, Lazada, TikTok Shop, Website)
3. Xác thực qua OAuth (đăng nhập tài khoản sàn)
4. Cấu hình đồng bộ:
   - Đồng bộ sản phẩm: chọn danh mục sản phẩm muốn đăng bán
   - Map danh mục sản phẩm (danh mục BizOne ↔ danh mục sàn)
   - Đồng bộ tồn kho: bật/tắt
   - Đồng bộ đơn hàng: bật/tắt
5. Kết nối thành công

**Yêu cầu:**
- Trạng thái kết nối hiển thị (Đã kết nối / Ngắt kết nối / Lỗi xác thực)
- Đồng bộ sản phẩm: thêm mới / cập nhật / ngừng bán
- Đồng bộ đơn hàng: tự động lấy đơn mới, cập nhật trạng thái
- Đồng bộ tồn kho: tự động cập nhật khi có thay đổi
- Lịch sử đồng bộ (log thành công/lỗi)
- Xử lý lỗi: retry tự động, thông báo khi đồng bộ thất bại

#### UC-OMNI-02: Website bán hàng BizOne

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Website bán hàng được BizOne cung cấp sẵn |
| **Tác nhân** | Khách hàng (người mua), Admin |

**Yêu cầu:**
- Tên miền: `[ten-cua-hang].bizone.vn` hoặc tên miền riêng
- Giao diện: thiết kế mặc định theo ngành hàng (thời trang, điện tử, thực phẩm...)
- Danh mục sản phẩm, tìm kiếm
- Giỏ hàng, thanh toán online (VNPay, Momo, PayOS)
- Quản lý đơn hàng: theo dõi trạng thái
- Đăng ký/đăng nhập khách hàng
- Tích điểm thành viên
- Đồng bộ: sản phẩm, tồn kho, đơn hàng tự động với BizOne

---

### 3.10. Module Kế toán & Tài chính

#### UC-ACC-01: Thu chi

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Ghi nhận các khoản thu và chi hàng ngày |
| **Tác nhân** | Manager, Admin |

**Yêu cầu:**
- Ghi nhận thu: doanh thu từ POS, doanh thu online, thu khác
- Ghi nhận chi: nhập hàng, chi phí mặt bằng, lương, điện nước, chi khác
- Danh mục thu/chi: phân loại chi tiết (có thể tùy chỉnh)
- Xem sổ quỹ: danh sách các giao dịch thu/chi theo ngày
- Số dư quỹ đầu kỳ / cuối kỳ

#### UC-ACC-02: Quỹ tiền mặt

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Quản lý số dư quỹ tiền mặt, đối soát cuối ca |
| **Tác nhân** | Admin, Manager |

**Yêu cầu:**
- Số dư quỹ đầu ca (nhập từ quỹ thực tế)
- Số dư quỹ cuối ca (tự động tính = đầu ca + thu - chi trong ca)
- Đối soát cuối ca: nhập số dư thực tế, hệ thống so sánh
- Quản lý nhiều quỹ (quỹ chính, quỹ lẻ, quỹ online...)
- Lịch sử biến động quỹ

#### UC-ACC-03: Công nợ

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Theo dõi công nợ phải thu và phải trả |
| **Tác nhân** | Admin, Manager |

**Yêu cầu:**
- Công nợ phải thu: từ khách hàng mua chịu
- Công nợ phải trả: cho nhà cung cấp
- Xem báo cáo công nợ theo từng khách hàng/nhà cung cấp
- Cảnh báo quá hạn
- Ghi nhận thanh toán, đối trừ công nợ

---

### 3.11. Module Marketing & Khuyến mãi

#### UC-MKT-01: Mã giảm giá

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Tạo và quản lý mã giảm giá |
| **Tác nhân** | Admin, Manager |

**Luồng chính:**
1. Người dùng vào "Marketing" → "Mã giảm giá"
2. Chọn "Tạo mã giảm giá"
3. Nhập thông tin:
   - Loại: % giảm / Số tiền cố định / Miễn phí vận chuyển
   - Giá trị: 10%, 50,000đ, ...
   - Điều kiện: đơn hàng tối thiểu, sản phẩm áp dụng, danh mục áp dụng
   - Giới hạn: số lần sử dụng (tổng / 1 khách)
   - Thời gian hiệu lực
   - Đối tượng: tất cả khách / nhóm khách cụ thể / khách cụ thể
4. Lưu → mã giảm giá được tạo
5. Mã giảm giá được áp dụng tại POS/Online

**Yêu cầu:**
- Tạo mã tự động hoặc nhập thủ công
- Xem báo cáo hiệu quả mã giảm giá (số lượt dùng, doanh thu tăng thêm)
- Vô hiệu hóa mã giảm giá bất kỳ lúc nào

#### UC-MKT-02: Flash Sale

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Thiết lập chương trình flash sale |
| **Tác nhân** | Admin, Manager |

**Luồng chính:**
1. Người dùng vào "Marketing" → "Flash Sale"
2. Chọn "Tạo flash sale"
3. Nhập: tên chương trình, khung giờ (ví dụ: 12:00 - 13:00), ngày
4. Thêm sản phẩm và giá flash sale
5. Giới hạn số lượng flash sale cho mỗi sản phẩm
6. Lưu → flash sale được kích hoạt
7. Khi tới giờ, sản phẩm trong flash sale hiển thị giá đặc biệt trên POS và Online
8. Hết giờ, giá tự động trở về giá gốc

#### UC-MKT-03: Mua X tặng Y

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Chương trình khuyến mãi mua hàng tặng hàng |
| **Tác nhân** | Admin, Manager |

**Luồng chính:**
1. Người dùng vào "Marketing" → "Mua X tặng Y"
2. Chọn "Tạo chương trình"
3. Cấu hình:
   - Sản phẩm chính (mua): sản phẩm A, B, hoặc bất kỳ
   - Sản phẩm tặng: sản phẩm C
   - Số lượng: mua 2 tặng 1
   - Điều kiện: áp dụng cho đơn hàng tối thiểu X
4. Tự động áp dụng tại POS khi thỏa điều kiện

---

### 3.12. Module Cài đặt & Cấu hình Hệ thống

#### UC-CONFIG-01: Cấu hình cửa hàng

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Admin cấu hình thông tin cửa hàng |
| **Tác nhân** | Admin |

**Yêu cầu:**
- Thông tin cửa hàng: tên, địa chỉ, SĐT, email, MST, logo
- Cấu hình chi nhánh: thêm/sửa/xóa chi nhánh
- Cấu hình thuế: thuế suất mặc định, có bao gồm VAT trong giá bán không
- Cấu hình tiền tệ: VND, USD
- Cấu hình đơn vị: mặc định hệ đo lường, định dạng ngày giờ
- Cấu hình POS: loại máy in (nhiệt/A4), tự động in sau khi thanh toán, chế độ 2 màn hình
- Cấu hình tích điểm: tỷ lệ tích điểm, tỷ lệ quy đổi điểm
- Cấu hình cảnh báo tồn kho: ngưỡng cảnh báo mặc định
- Cấu hình giờ làm việc: khung giờ mở cửa

#### UC-CONFIG-02: Quản lý vai trò & quyền tùy chỉnh

| Mục | Mô tả |
|-----|-------|
| **Mô tả** | Admin cấu hình vai trò và phân quyền tùy chỉnh |
| **Tác nhân** | Admin |

**Yêu cầu:**
- Xem danh sách vai trò mặc định: Admin, Manager, Seller, Warehouse, Viewer
- Thêm vai trò mới
- Với mỗi vai trò, cấu hình quyền chi tiết:
  - Từng module: Xem / Thêm / Sửa / Xóa / Duyệt
  - Từng chức năng đặc biệt: Hủy hóa đơn, Điều chỉnh giá, Xem giá vốn, Xuất báo cáo
- Sao chép quyền từ vai trò có sẵn

---

## 4. Yêu cầu giao diện người dùng (UI/UX)

### 4.1. Nguyên tắc thiết kế chung

- **Đơn giản, trực quan**: Người dùng có kỹ năng CNTT cơ bản có thể sử dụng được ngay
- **Nhất quán**: Cùng một pattern (nút, form, bảng) xuyên suốt các module
- **Hiệu suất**: Mọi thao tác phải phản hồi trong < 1 giây
- **Mobile-friendly**: Dùng được trên tablet và smartphone (PWA)
- **Tối ưu cho POS**: Các nút bấm lớn, font chữ rõ, tương phản cao, hỗ trợ màn hình cảm ứng
- **Accessibility**: Độ tương phản màu sắc đạt WCAG AA, hỗ trợ phím tắt

### 4.2. Bảng màu & Typography

| Thành phần | Giá trị |
|------------|---------|
| **Màu chính (Primary)** | Xanh dương (#2563EB) |
| **Màu phụ (Secondary)** | Xám (#6B7280) |
| **Màu thành công** | Xanh lá (#10B981) |
| **Màu cảnh báo** | Vàng cam (#F59E0B) |
| **Màu lỗi** | Đỏ (#EF4444) |
| **Font chữ** | Inter (Web), SF Pro (macOS) |
| **Cỡ chữ** | 14px (body), 16px (heading), 20px+ (POS) |

### 4.3. Cấu trúc giao diện tổng thể

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

- **Sidebar**: Có thể thu gọn (collapsible), icon + text
- **Top Bar**: Breadcrumb, thanh tìm kiếm toàn hệ thống, thông báo, profile
- **Main Content**: Routing nội bộ, mỗi module là một page

### 4.4. Giao diện POS (đặc thù)

POS là module quan trọng nhất, cần giao diện riêng biệt:

```
┌──────────────────────────────────────────────────────────┐
│  [Back]  POS Bán hàng               Ca: 09:00 - 17:00  │
│                         Nhân viên: Nguyễn Văn A         │
├────────────────────────────────────┬─────────────────────┤
│    SẢN PHẨM                       │   GIỎ HÀNG           │
│  ┌────────────────────────────────┐│  ┌─────────────────┐│
│  │ 🔍 Tìm kiếm sản phẩm... [Q]   ││  │ Áo Thun Nam      ││
│  └────────────────────────────────┘│  │ SL: 2 x 150,000 ││
│  [Thời trang] [Điện tử] [Khác]    │  │ Áo Sơ Mi Nữ     ││
│  ┌────┬────┬────┬────┐             │  │ SL: 1 x 250,000 ││
│  │ SP1│ SP2│ SP3│ SP4│             │  │ Quần Jean       ││
│  │img │img │img │img │             │  │ SL: 1 x 350,000 ││
│  │50k │80k │120k│200k│             │  ├─────────────────┤│
│  ├────┼────┼────┼────┤             │  │ Tạm tính: 900k  ││
│  │ SP5│ SP6│ SP7│ SP8│             │  │ Giảm giá: -50k  ││
│  │img │img │img │img │             │  │ THÀNH TIỀN:     ││
│  │30k │90k │70k │150k│             │  │   850,000 VND   ││
│  └────┴────┴────┴────┘             │  ├─────────────────┤│
│                                     │  │ [KM: Mã giảm...]││
│                                     │  │ [Ghi chú]       ││
│                                     │  ├─────────────────┤│
│                                     │  │ [TIỀN MẶT]      ││
│                                     │  │ [CK]  [THẺ]    ││
│                                     │  │ [VÍ ĐT] [QR]   ││
│                                     │  └─────────────────┘│
└────────────────────────────────────┴─────────────────────┘
```

**Yêu cầu cụ thể cho giao diện POS:**
- Nút bấm tối thiểu 44x44px (hỗ trợ cảm ứng)
- Font chữ tối thiểu 16px
- Số tiền hiển thị lớn, dễ đọc
- Màu sắc tương phản cao
- Phím tắt cho mọi thao tác
- Tự động focus vào ô tìm kiếm khi quét mã vạch
- Hỗ trợ bàn phím số riêng (numeric keypad)
- Hiển thị thông báo toast khi thêm sản phẩm

### 4.5. Responsive breakpoints

| Thiết bị | Breakpoint | Ghi chú |
|----------|-----------|---------|
| Desktop | > 1024px | Full sidebar, full layout |
| Tablet | 768px - 1024px | Sidebar thu gọn (icon only) |
| Mobile (PWA) | < 768px | Bottom navigation, full width |

---

## 5. Quy trình & Luồng nghiệp vụ

### 5.1. Luồng bán hàng hoàn chỉnh (End-to-End)

```
Mở ca
  │
  ▼
Bắt đầu phiên bán
  │
  ▼
Khách đến quầy
  │
  ├── Khách có thành viên? → Tìm SĐT → Chọn khách
  │                                   → Hiển thị điểm/hạng
  └── Khách mới → (Nhập SĐT sau) hoặc bỏ qua
  │
  ▼
Thêm sản phẩm vào giỏ
  │
  ├── Quét mã vạch
  ├── Tìm kiếm
  └── Chọn từ danh sách
  │
  ▼
Áp dụng khuyến mãi (tự động / thủ công)
  │
  ▼
Xem giỏ hàng (màn hình khách)
  │
  ▼
Thanh toán
  │
  ├── Tiền mặt → Nhập tiền khách → Tính tiền thừa
  ├── Chuyển khoản → Hiển thị STK/QR
  ├── Thẻ → Kết nối POS terminal
  ├── Ví điện tử → QR Momo/VNPay
  ├── Hỗn hợp → Nhập % từng phương thức
  └── Quẹt thẻ thành viên → Trừ điểm (nếu có)
  │
  ▼
Hoàn tất hóa đơn
  │
  ▼
Tự động:
  ├── In hóa đơn nhiệt
  ├── Gửi hóa đơn email/SMS
  └── Cộng điểm thành viên
  │
  ▼
  ┌── Khách tiếp theo? → [Reset giỏ] → Quay lại bắt đầu
  └── Hết ca? → [Khóa ca] → Đối soát
```

### 5.2. Luồng quản lý sản phẩm (từ nhập đến bán)

```
Nhà cung cấp giao hàng
  │
  ▼
Tạo phiếu nhập kho
  │
  ▼
Nhập kho → Cập nhật tồn kho + Giá vốn
  │
  ▼
Sản phẩm có tồn kho → Hiển thị trên POS
  │
  ▼
Khách mua → Tạo hóa đơn → Trừ tồn kho
  │
  ▼
Tồn kho giảm xuống dưới ngưỡng?
  │
  ├── Có → Cảnh báo → Tạo đơn nhập hàng mới
  └── Không → OK
```

### 5.3. Luồng Omni Channel (đơn online)

```
Khách đặt hàng trên Website / Shopee / Lazada
  │
  ▼
Webhook / API đồng bộ
  │
  ▼
Tạo đơn hàng trong BizOne (trạng thái: Chờ xác nhận)
  │
  ▼
Nhân viên xác nhận đơn
  │
  ▼
Đơn hàng → Đang chuẩn bị
  │
  ▼
Xuất kho
  │
  ▼
Bàn giao vận chuyển → Nhập mã vận đơn
  │
  ▼
Đang giao hàng
  │
  ▼
Khách nhận hàng → Hoàn thành
  │
  └── Khách trả hàng → Xử lý đổi trả
```

---

## 6. Yêu cầu thông báo & Push Notification

### 6.1. Các loại thông báo

| Loại | Kênh | Đối tượng | Nội dung |
|------|------|-----------|----------|
| Đơn hàng mới (online) | Hệ thống + Email | Manager | "Đơn hàng #123 từ Shopee - 850,000đ" |
| Cảnh báo tồn kho | Hệ thống | Warehouse | "Áo Thun Nam sắp hết (còn 2)" |
| Kiểm kê chênh lệch | Hệ thống | Manager | "Kiểm kê kho H1 chênh lệch 5 SP" |
| Công nợ quá hạn | Hệ thống + SMS | Admin | "KH Nguyễn Văn A nợ 2,500,000đ quá 30 ngày" |
| Đồng bộ lỗi | Hệ thống | Admin | "Đồng bộ Shopee thất bại: token hết hạn" |
| Báo cáo định kỳ | Email | Admin/Manager | "Báo cáo doanh thu tháng 6" |
| Nhắc ca làm việc | Hệ thống | Seller | "Ca làm việc của bạn bắt đầu lúc 09:00" |

### 6.2. Yêu cầu kỹ thuật thông báo

- Thông báo hệ thống: hiển thị trong app (notification center, badge trên sidebar)
- Thông báo trình duyệt: Web Push Notification (khi tab đang mở)
- Email: gửi qua SMTP, hỗ trợ template
- SMS: tích hợp với nhà cung cấp SMS
- Zalo: tích hợp Zalo OA (Official Account)
- Notification Center: lưu lịch sử thông báo 30 ngày, đánh dấu đã đọc/chưa đọc

---

## 7. Yêu cầu về dữ liệu

### 7.1. Dữ liệu đầu vào

| Module | Dữ liệu nhập | Định dạng | Validation |
|--------|-------------|-----------|------------|
| Sản phẩm | Tên, SKU, giá, tồn kho | Text, number | SKU unique, giá > 0 |
| Khách hàng | Tên, SĐT, email | Text, phone, email | SĐT unique, đúng format |
| Hóa đơn | Sản phẩm, SL, giá, thanh toán | Array, number | SL > 0, tổng tiền >= 0 |
| Nhập kho | Sản phẩm, SL, đơn giá | Array, number | SL > 0, đơn giá >= 0 |
| Nhân viên | Tên, SĐT, email, vai trò | Text, phone, email, select | SĐT/email unique |

### 7.2. Dữ liệu đầu ra

| Module | Dữ liệu xuất | Định dạng |
|--------|-------------|-----------|
| Sản phẩm | Danh sách sản phẩm | Excel |
| Báo cáo | Doanh thu, lợi nhuận, tồn kho | PDF, Excel |
| Hóa đơn | Hóa đơn bán hàng | In nhiệt, PDF, Email |
| Khách hàng | Danh sách khách hàng | Excel |
| Đơn hàng | Danh sách đơn hàng | Excel |

### 7.3. Yêu cầu về giá trị mặc định & dữ liệu seed

- Khi tạo cửa hàng mới (tenant mới), hệ thống tự động tạo:
  - Tài khoản Admin mặc định
  - Các vai trò mặc định (Admin, Manager, Seller, Warehouse, Viewer)
  - Một số danh mục sản phẩm mẫu (Thời trang, Điện tử, Thực phẩm...)
  - Một số sản phẩm mẫu
  - Cấu hình mặc định (thuế, tỷ lệ tích điểm...)
  - Báo cáo mẫu (dashboard trống)

---

## 8. Yêu cầu hỗ trợ & Training

### 8.1. Tài liệu hướng dẫn

- Hướng dẫn sử dụng by module (dạng web, có search)
- Video hướng dẫn ngắn (1-3 phút) cho từng tác vụ chính
- FAQ (cập nhật theo feedback người dùng)
- In-app help: tooltip, popup hướng dẫn lần đầu sử dụng

### 8.2. Hỗ trợ kỹ thuật

- Chat support trực tiếp trên ứng dụng
- Email support
- Knowledge Base (các lỗi thường gặp và cách xử lý)

---

## 9. Ràng buộc & Giả định

### 9.1. Ràng buộc kỹ thuật

- Hệ thống chạy trên nền tảng web, yêu cầu trình duyệt hiện đại (Chrome 100+, Firefox 100+, Edge 100+, Safari 15+)
- Kết nối Internet ổn định (trừ chế độ offline tạm thời)
- POS cần máy tính/màn hình cảm ứng, máy in nhiệt, máy quét mã vạch
- Ứng dụng mobile dạng PWA (không phải native iOS/Android)

### 9.2. Giả định

- Người dùng có kiến thức cơ bản về sử dụng web và thiết bị văn phòng
- Các sàn TMĐT (Shopee, Lazada, TikTok) duy trì API ổn định
- Cổng thanh toán (VNPay, Momo, PayOS) hoạt động ổn định
- Dữ liệu được backup tự động hàng ngày

---

## 10. Tiêu chí chấp nhận (Acceptance Criteria)

### 10.1. POS

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-POS-01 | Tạo hóa đơn < 5 giây | Từ khi chọn SP đầu tiên đến khi hoàn tất thanh toán |
| AC-POS-02 | Quét mã vạch | Quét barcode tự động thêm SP vào giỏ, không cần thao tác thêm |
| AC-POS-03 | POS 2 màn hình | Màn hình khách hàng cập nhật real-time, không lag |
| AC-POS-04 | In hóa đơn | In hóa đơn nhiệt trong < 3 giây sau khi thanh toán |
| AC-POS-05 | Đổi trả | Đổi trả hàng hoàn tất trong < 30 giây |

### 10.2. Tồn kho

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-WH-01 | Tồn kho real-time | Sau khi thanh toán, tồn kho cập nhật trong < 1 giây |
| AC-WH-02 | Kiểm kê | Kiểm kê 1000 sản phẩm trong < 30 phút |
| AC-WH-03 | Cảnh báo tồn kho | Cảnh báo hiển thị trong < 5 giây sau khi tồn kho xuống dưới ngưỡng |

### 10.3. Báo cáo

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-RPT-01 | Dashboard load | Dashboard tải trong < 2 giây |
| AC-RPT-02 | Báo cáo xuất | Xuất báo cáo Excel/PDF trong < 5 giây |
| AC-RPT-03 | Dữ liệu real-time | Dashboard hiển thị dữ liệu cách đây tối đa 30 giây |

### 10.4. Hiệu năng

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-PERF-01 | API response | 95% API requests hoàn thành trong < 200ms |
| AC-PERF-02 | Concurrent users | Hệ thống hỗ trợ 500+ người dùng đồng thời |
| AC-PERF-03 | Search response | Tìm kiếm sản phẩm phản hồi trong < 300ms |

### 10.5. Bảo mật

| ID | Tiêu chí | Mô tả |
|----|----------|-------|
| AC-SEC-01 | Authentication | Người dùng không thể truy cập nội dung khi chưa đăng nhập |
| AC-SEC-02 | Authorization | Người dùng chỉ thấy được module/quyền được cấp |
| AC-SEC-03 | Audit | Mọi thao tác CRUD quan trọng đều được ghi log |
| AC-SEC-04 | Data isolation | Dữ liệu của tenant A không thể bị tenant B truy cập |

---

## 11. Phụ lục

### 11.1. Bảng thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|-----------|
| POS | Point of Sale - Điểm bán hàng |
| SKU | Stock Keeping Unit - Mã hàng hóa |
| CRM | Customer Relationship Management - Quản lý quan hệ khách hàng |
| PWA | Progressive Web Application - Ứng dụng web tiến bộ (cài được như app native) |
| Omni Channel | Bán hàng đa kênh đồng bộ |
| RBAC | Role-Based Access Control - Phân quyền dựa trên vai trò |
| Hóa đơn điện tử | Hóa đơn có mã của cơ quan thuế |
| Audit Log | Nhật ký thao tác |
| Flash Sale | Chương trình giảm giá trong khung giờ giới hạn |
| COD | Cash on Delivery - Thanh toán khi nhận hàng |
| MST | Mã số thuế |
| HSD | Hạn sử dụng |
| Tenant | Khách hàng sử dụng hệ thống (cửa hàng/doanh nghiệp) |

### 11.2. Danh sách màn hình chính

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

*Tài liệu này có thể được cập nhật trong quá trình phát triển dự án. Các use case mới sẽ được bổ sung khi có yêu cầu từ stakeholders.*

*Version history:*
| Ngày | Phiên bản | Người cập nhật | Nội dung |
|------|-----------|----------------|-----------|
| 11/06/2026 | 1.0 | | Tạo mới dựa trên BRD-BizOne.md |
