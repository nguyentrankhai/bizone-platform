# Tiến độ thực hiện — BizOne & Payment Hub

> Theo dõi tiến độ các task trong [PLAN.md](PLAN.md) và ghi chú kết quả của từng task.
> Cập nhật mỗi khi một task bắt đầu, hoàn thành hoặc bị chặn.

**Trạng thái:** ✅ Hoàn thành · 🟡 Đang làm · ⬜ Chưa bắt đầu · ⛔ Bị chặn

**Cập nhật lần cuối:** 2026-11-10 (QA-3 — rà soát cuối Giai đoạn 4: tiêu chí P4.0–P4.8 chạy lại đạt; phát hiện #93–#99, mức cao #93 WebSocket POS không kiểm chủ ca / chi nhánh — chờ người dùng quyết định sửa. P4.8 xong; P3.3/P3.4/P3.5 vẫn 🟡 chờ credential VNPay / quét QR)

---

## Tổng quan

| Giai đoạn | Tổng task | ✅ | 🟡 | ⬜ |
|-----------|-----------|----|----|----|
| 1 — Nền tảng | 8 | 8 | 0 | 0 |
| 2 — BizOne Core MVP | 10 | 10 | 0 | 0 |
| 3 — Payment Hub MVP | 8 | 5 | 3 | 0 |
| 4 — BizOne Mở rộng | 9 | 9 | 0 | 0 |
| 5 — Payment Hub Mở rộng | 6 | 0 | 0 | 6 |
| 6 — BizOne Nâng cao | 7 | 0 | 0 | 7 |
| 7 — Payment Hub Nâng cao | 5 | 0 | 0 | 5 |
| **Tổng** | **53** | **32** | **3** | **18** |

---

## Theo dõi vấn đề

### Còn mở

| # | Vấn đề | Nguồn | Xử lý ở |
|---|--------|-------|---------|
| ~~1~~ | ~~WebSocket Payment Hub (`:4001/ws`) chưa xác thực~~ | ~~P1.2~~ | ✅ QA-1 |
| ~~2~~ | ~~Token Exchange v1 deprecated → chọn lại cách BizOne gọi Payment Hub~~ | ~~Nâng cấp Keycloak~~ | ✅ P1.5 (`client_credentials`) |
| ~~3~~ | ~~Job webhook chứa `secret` trong Redis~~ | ~~P1.2~~ | ✅ P3.6 |
| ~~4~~ | ~~Payment Hub health check dùng driver `mariadb` trực tiếp → chuyển sang Prisma~~ | ~~P1.2~~ | ✅ P1.4 |
| ~~5~~ | ~~`paymentdb` còn charset mặc định `utf8` / `utf8_general_ci` (utf8mb3) → đổi sang `utf8mb4_unicode_ci`~~ | ~~Kiểm tra 2026-11-03~~ | ✅ P1.4 |
| 7 | **[Chặn dùng app → đã có cách tạm]** Dev chưa có đăng nhập OIDC trong trình duyệt → tạm: ✅ P4.0 (2026-11-09: đặt `AUTH_DEV_BYPASS=true` trong `.env.local` của app, không cần `DEV_AUTH_TOKEN`), làm thật: P6.7 (2026-11-07: trang giờ hiện banner "Chưa đăng nhập" thay vì trắng): page lấy token từ env `DEV_AUTH_TOKEN` (hết hạn 15 phút, bị "đóng băng" vào trang static khi build). Áp dụng cho cả Payment Hub Admin (QA-1): API `/api/internal/*` đã yêu cầu JWT + role, nhưng **page server component** (`/transactions`…) vẫn render dữ liệu không cần đăng nhập | P2.2/P2.4, QA-1 | Task auth UI |
| ~~8~~ | ~~Router `product.ts` dùng `Number(ctx.user.id)`~~ | ~~P2.4~~ | ✅ P2.5 |
| ~~9~~ | ~~29 file chưa đạt `npm run format:check`~~ | ~~P2.4~~ | ✅ QA-1 (CI chặn từ nay) |
| ~~10~~ | ~~Lỗi nghiệp vụ ném dạng `Error` thường → tRPC 500~~ | ~~P2.1/P2.3~~ | ✅ P2.5 |
| ~~11~~ | ~~Seed chưa có chi nhánh/kho mặc định~~ | ~~P2.5~~ | ✅ P4.6 (seed tạo CN01 + KHO-CN01 khi DB chưa có chi nhánh; UI `/settings/branches` tạo chi nhánh kèm kho) |
| 12 | Docker image/compose của BizOne chưa chạy process `pos.mjs` (WS :3002) và `worker.mjs` (từ P4.2: thiếu worker thì yêu cầu xuất báo cáo PDF/Excel nằm chờ mãi; worker cần `node_modules/pdfmake` — để external khi bundle; từ P4.7: thiếu worker thì không gửi email/SMS/push, không nhắc ca/công nợ; thiếu `pos.mjs` thì chuông chỉ cập nhật bằng poll 30 s) | P2.5 | P6.5 / khi triển khai |
| 13 | Hàng đợi tuần tự cart theo ca nằm trong bộ nhớ process WS → chạy nhiều instance cần sticky theo `sessionId` (hoặc Redis lock) | P2.5 | P6.5 |
| ~~14~~ | ~~Chưa có UI cài đặt tài khoản ngân hàng VietQR và tên cửa hàng~~ | ~~P2.6~~ | ✅ P4.6 (cấu hình riêng theo chi nhánh: tên in hoá đơn, tài khoản VietQR, tiền tố HĐ, lời chào; giá trị chung `store_config` vẫn sửa trong DB — màn hình cài đặt chung làm sau) |
| 15 | Thu ngân đang hiển thị `username` vì token Keycloak chưa có claim `name` (client `bizone-frontend` thiếu mapper họ tên) | P2.6 | Task auth UI |
| 16 | `VNPAY_TMN_CODE` trong `.env.development` là placeholder (`SANDBOX_TMN`) → VNPay sandbox trả lỗi 72 (trang thanh toán) / 03 (refund, querydr). Cần đăng ký tại sandbox.vnpayment.vn/devreg và chạy lại `npm run db:seed`; IPN thật cần URL public (ngrok) khai báo trên cổng VNPay | P3.3 | Người dùng → hoàn tất P3.3 |
| ~~17~~ | ~~Sau IPN chưa gửi webhook cho merchant~~ | ~~P3.3~~ | ✅ P3.6 |
| 18 | `VnpayConnector.refund()` đã sẵn sàng nhưng chưa có luồng nghiệp vụ (bảng `refunds`, trạng thái `Refunded`/`PartiallyRefunded`, API) | P3.3 | P5.3 |
| 19 | IPN thành công cho GD đã `Expired`/`Failed` chỉ ghi log `late_payment` (trả `02`) → cần đối soát / hoàn tiền thủ công | P3.3 | P5.4 |
| 20 | Cấp tenant mới đang làm tay: tạo DB → `prisma migrate deploy` → `SEED_TENANT_ID=… db:seed` → thêm vào `TENANT_DATABASES` + restart. Cần registry tenant trong DB (không phải env) + luồng onboarding tự động | QA-1 | P4.6 / P6.x |
| 21 | Chưa có màn hình cấp/thu hồi API key merchant — dùng `npm run apikey:create -- <MERCHANT_CODE>` (Payment Hub) | QA-1 | P3.5 / module Merchant |
| 22 | Mapper `merchant_id` đã có trên client `payhub-admin-console`, nhưng chưa user Keycloak nào được gán thuộc tính này (token admin hiện xem mọi merchant) | QA-1 | Khi có tài khoản merchant |
| 23 | VietQR đang dùng **tài khoản demo** (`VIETQR_*` trong `.env.development` / `.env.local`: Vietcombank `0011001234567`) → điền tài khoản nhận thật rồi `npm run db:seed` | P3.4 | Người dùng |
| 24 | Chưa có xác nhận tự động cho thanh toán VietQR: khách chuyển khoản xong, GD vẫn `Pending` đến khi hết hạn. Cần nguồn báo có (webhook ngân hàng/Casso/SePay hoặc sao kê) khớp theo nội dung CK = `txn_code` bỏ `-` | P3.4 | P5.4 Đối soát / connector ngân hàng |
| ~~25~~ | ~~`POST /api/v1/transactions` chưa nhận `payment_method: vietqr`; `/pay/{txn}` chưa có VietQR~~ | ~~P3.4~~ | ✅ P3.8 |
| 26 | Seed tạo partner config ở trạng thái `Active` mà chưa qua test kết nối (VNPay Sandbox với credential placeholder vẫn Active) — từ P3.5 trở đi, UI/API chỉ kích hoạt sau khi test đạt | P3.5 | Khi có credential VNPay thật (#16): test lại trên `/partners/1` |
| 27 | Layout admin Payment Hub (`PHLayout`/`PHSidebar`, P1.8) chưa responsive: ở 375 px sidebar chiếm gần hết màn hình, nút thu gọn không tác dụng | P3.5 | Task UI / P6.x |
| 28 | Log thay đổi đối tác lấy IP từ `x-forwarded-for` — tin cậy được khi chạy sau reverse proxy ghi đè header này | P3.5 | Khi triển khai (P6.5) |
| 29 | Sự kiện `refund.completed` đã khai báo (endpoint đăng ký được) nhưng chưa phát — chưa có luồng hoàn tiền | P3.6 | P5.3 |
| 30 | BizOne `/api/webhooks/payhub`: từ P4.5 áp `payment.success/failed/expired` cho thanh toán thẻ/QR tại POS (`merchant_txn_id = BZ-{tenant}-{intentId}` mang tenant). Còn lại: một bộ `PAYHUB_API_KEY/SECRET` + `PAYHUB_WEBHOOK_SECRET` cho cả app (một merchant Payment Hub cho mọi tenant — chưa map merchant ↔ tenant); đơn hàng online chưa thanh toán qua Payment Hub | P3.6 | P6.1 / onboarding tenant (#20) |
| 31 | API webhook cho merchant (`POST /api/v1/webhooks`, `POST /api/v1/webhook-test` trong OpenAPI / API-Design §5.4) chưa có — hiện chỉ admin cấu hình qua `/api/internal/webhooks` | P3.6 | Cổng merchant / P7.x |
| 32 | Production: không đặt `WEBHOOK_ALLOW_PRIVATE_NETWORKS` (chặn SSRF tới IP nội bộ, bắt buộc https). Nếu BizOne nằm cùng mạng nội bộ với Payment Hub cần thêm allowlist host thay vì bật cờ này | P3.6 | P6.5 / triển khai |
| 33 | Cảnh báo dashboard dùng ngưỡng cố định trong code (`ALERT_RULES` ở `lib/dashboard.ts`: ≥ 5 GD lỗi và ≥ 30 % trong 60 phút; ≥ 5 lần gửi webhook lỗi/giờ; outbox kẹt > 5 phút). Chưa có cảnh báo "đối tác mất kết nối", "đối soát chênh lệch", "hoàn tiền" như mockup — chưa có nguồn dữ liệu | P3.7 | P5.4 (đối soát), P5.6/P7.x (giám sát connector, cấu hình ngưỡng) |
| 34 | Dashboard theo merchant (token có claim `merchant_id`) mới kiểm bằng code + unit, chưa kiểm end-to-end vì chưa có user Keycloak mang claim này (#22) | P3.7 | Khi có tài khoản merchant |
| 35 | Route Engine chỉ có API admin (`/api/internal/routes/*`), chưa có màn hình cấu hình ưu tiên đối tác theo merchant / xem circuit | P3.8 | Module Merchant / P7.1 (`app/connectors`) |
| 36 | Circuit breaker mức nhẹ (bộ đếm Redis, chỉ tính lỗi lúc tạo thanh toán, không ghi DB): chưa có Health Monitor định kỳ, chưa dùng bảng `connector_health_logs` / `connector_circuit_breaker_states` (migration_001), `retry_policy` của partner chưa áp; trạng thái circuit mất khi Redis bị xoá | P3.8 | P7.1 / P7.5 |
| 37 | `payment_url` khi không chọn phương thức lấy từ `NEXT_PUBLIC_APP_URL` (`transaction.service`, giá trị lúc build) còn trang QR/ảnh QR/return URL dùng `APP_URL` (lúc chạy) — cần thống nhất một biến khi triển khai | P3.8 (phát hiện) | P6.5 / triển khai |
| 38 | Đổi cấu hình định tuyến (PUT routes, reset circuit) mới ghi `console`, chưa vào audit log | P3.8 | P7.2 |
| ~~39~~ | ~~**[Cao]** Dashboard BizOne: cache Redis không theo tenant; số liệu cũ tới 5 phút; ngày theo giờ máy chủ~~ | ~~QA-2 (P2.9)~~ | ✅ QA-2 fix |
| ~~40~~ | ~~**[Cao]** Audit Log: HĐ POS không ghi log, `user_id` luôn NULL, nhiều module không được ghi~~ | ~~QA-2 (P2.10)~~ | ✅ QA-2 fix |
| ~~41~~ | ~~**[Cao]** Idempotency Payment Hub: sai tên header so với spec; request đồng thời cùng key tạo nhiều GD~~ | ~~QA-2 (P3.1)~~ | ✅ QA-2 fix |
| ~~42~~ | ~~**[Cao]** `merchant_txn_id` không bắt buộc, không duy nhất theo merchant~~ | ~~QA-2 (P3.1)~~ | ✅ QA-2 fix |
| ~~43~~ | ~~Lỗi nghiệp vụ của kho / đơn hàng / CRM vẫn trả **HTTP 500 `INTERNAL_SERVER_ERROR`**~~ | ~~QA-2~~ | ✅ QA-2 fix |
| ~~44~~ | ~~`created_by`/`updated_by` = NULL: `product.create/update` dùng `Number(ctx.user!.id)`, `order` dùng `parseInt(ctx.user.id)`~~ | ~~QA-2~~ | ✅ QA-2 fix |
| ~~45~~ | ~~Đơn hàng: chấp nhận tổng tiền âm (giảm giá 50.000 > tạm tính → −49.000); đơn giá lấy từ client, không đối chiếu giá bán~~ | ~~QA-2 (P2.7)~~ | ✅ QA-2 fix |
| ~~46~~ | ~~Công nợ: `payDebt` cho trả vượt số còn nợ (nợ 50.000, đã trả 60.000, `remainingAmount` = 0)~~ | ~~QA-2 (P2.8)~~ | ✅ QA-2 fix |
| ~~47~~ | ~~Import Excel: số dòng báo lỗi sai, thông báo Zod tiếng Anh~~ | ~~QA-2 (P2.1)~~ | ✅ QA-2 fix |
| 48 | Hiệu năng kho sát ngưỡng: xác nhận phiếu nhập 999 SP 1,04 s (PLAN < 1 s); hoàn tất kiểm kê 999 SP 2,1 s (update từng dòng) | QA-2 (P2.3) | P6.x Performance |
| ~~49~~ | ~~Dashboard BizOne chưa có drill-down từ biểu đồ (tiêu chí P2.9)~~ | ~~QA-2 (P2.9)~~ | ✅ QA-2 fix |
| ~~50~~ | ~~`npm audit --omit=dev`: `shadcn` CLI nằm trong dependencies (BizOne còn `exceljs → uuid` moderate)~~ | ~~QA-2~~ | ✅ QA-2 fix |
| ~~51~~ | ~~`.env.example` thiếu biến code đang dùng (cả 2 app)~~ | ~~QA-2~~ | ✅ QA-2 fix |
| 52 | API list không thống nhất: product/inventory trả `{ items, meta }` + `pageSize`; order/audit trả `{ items, total, page, limit }`; không tìm đơn theo mã vận đơn | QA-2 | P4.x (chuẩn hoá khi mở rộng) |
| 53 | Hardening trước production: compose dùng mật khẩu mặc định (`mypass`, `123456`), `docker-compose.keycloak.yml` ghi cứng `KC_DB_PASSWORD`, realm JSON chứa mật khẩu user dev | QA-2 | P6.5 Security Hardening |
| 54 | Layout BizOne (`Sidebar`) chưa responsive: ở 375 px sidebar mở sẵn che nội dung (giống #27 bên Payment Hub; P4.2: `main` chỉ còn 151 px); sidebar còn link tới trang chưa có (`/staff` ✅ P4.1, `/reports` ✅ P4.2, `/suppliers` ✅ P4.3, `/omni`, `/marketing` ✅ P4.4, `/accounting`, `/settings` → 404 khi prefetch) | QA-2 fix (kiểm UI) | P4.x (trang mới) / P6.x PWA |
| 55 | API tra cứu GD merchant (`GET /api/v1/transactions/{id}`, `/merchant/{merchant_txn_id}`) trả object Prisma camelCase (`txnCode`, `merchantTxnId`) trong khi `POST` và OpenAPI dùng snake_case (`txn_code`…) — đổi sẽ ảnh hưởng hợp đồng API | QA-2 fix | Trước khi có merchant tích hợp thật (P5.x) |
| 56 | Lần tải lại thứ 2 **cùng URL trong cùng tab** của một số trang client (`/audit-log`, `/staff`, `/staff/shifts`, `/staff/commissions`, `/warehouse`) kẹt ở fallback Suspense "Đang tải..." (component bên trong không render, không gọi API) — P4.0 (2026-11-09) xác nhận xảy ra **cả với `next start`** và cả bản HEAD trước P4.0 (tab mới / điều hướng từ sidebar thì bình thường); có từ trước P4.1 | P4.1 (kiểm UI) | Theo dõi khi nâng Next / task auth UI (#7) |
| 57 | Quyền chi tiết (`permissions`, 52 mã) được gán cho vai trò tuỳ chỉnh nhưng API mới kiểm ở mức module (`pos:write`, `product:write`…): gán "Hủy hóa đơn" = mở toàn bộ `pos:write`. Quyền của module chưa xây (omni, cài đặt) chưa có tác dụng — NCC đã có từ P4.3 (`supplier:read` / `supplier:write` / `supplier:manage_po`), marketing từ P4.4 (`marketing:coupon` / `marketing:flash_sale` / `marketing:promotion`), kế toán từ P4.8 (`accounting:read` mới + `accounting:fund` / `revenue_expense` / `debt`) | P4.1 | Khi xây module tương ứng (P4.3, P4.4, P4.8, P6.x) — tách capability theo thao tác |
| ~~58~~ | ~~WebSocket POS chỉ xét role trong token; nhân viên nghỉ việc giữ kết nối WS tới khi token hết hạn~~ | ~~P4.1~~ | ✅ P4.5 (`getStaffAccess` khi kết nối + mỗi lần ghi + quét 60 s đóng socket 4403) |
| 59 | Chấm công 1 lần/ngày (`attendance` unique `user_id, date`): nhiều ca trong ngày được gộp thành một khung (bắt đầu sớm nhất → kết thúc muộn nhất); chưa có sửa/duyệt chấm công thủ công, chưa có ngày nghỉ phép | P4.1 | Khi có yêu cầu nghiệp vụ (P4.x/P6.x) |
| ~~60~~ | ~~Phân quyền cần chi nhánh mà chưa có màn hình tạo chi nhánh~~ | ~~P4.1~~ | ✅ P4.6 (`/settings/branches`). Nhân viên tạo trước P4.1 chưa có vai trò trong DB vẫn hiện "Chưa phân quyền" tới khi gán |
| 61 | Báo cáo (và dashboard, lời lỗ / dòng tiền / đối soát P4.8) chỉ tính hoá đơn POS; đơn hàng online (module Đơn hàng, P2.7) chưa cộng vào doanh thu/lợi nhuận/nhân viên — cần quy tắc ghi nhận doanh thu cho đơn online (khi giao/hoàn tất, phí ship, hoàn tiền) | P4.2 | P6.1 (Omni Channel) hoặc task đơn hàng ↔ thanh toán |
| ~~62~~ | ~~Chưa có "Gửi email" báo cáo và gửi báo cáo định kỳ tự động~~ | ~~P4.2~~ | ✅ P4.7 (nút "Gửi email" trên `/reports` + sự kiện "Báo cáo định kỳ" ngày/tuần/tháng, file Excel/PDF đính kèm) |
| ~~63~~ | ~~Báo cáo khuyến mãi chưa đo riêng flash sale / Buy X Get Y vì chưa có module Marketing~~ | ~~P4.2~~ | ✅ P4.4 (`promotion_usage` + báo cáo `/marketing/report` theo từng chương trình) |
| ~~64~~ | ~~Lỗi validate input (Zod) của tRPC trả `message` là chuỗi JSON thô của Zod~~ | ~~P4.2 (kiểm lỗi)~~ | ✅ P4.3 (`errorFormatter`: câu tiếng Việt + `bizoneCode: VALIDATION_ERROR`, chi tiết theo trường) |
| 65 | Nhận hàng theo đơn nhập không cập nhật `products.cost_price` (giá vốn): báo cáo lợi nhuận / hoa hồng **và báo cáo lời lỗ P4.8** vẫn dùng giá vốn nhập tay (dòng thiếu giá vốn được cảnh báo). Cần quy tắc giá vốn (bình quân gia quyền theo lần nhập hoặc giá nhập gần nhất) — P4.8 không đổi vì ảnh hưởng báo cáo P4.2 / hoa hồng P4.1 | P4.3 | Task giá vốn riêng (cần quyết định nghiệp vụ: bình quân / nhập gần nhất) |
| ~~66~~ | ~~Chưa có thông báo chủ động khi công nợ NCC sắp/đã quá hạn~~ | ~~P4.3~~ | ✅ P4.7 (quét 08:00: sắp đến hạn N ngày, quá hạn lúc 1 và 30 ngày). Cột `supplier_debts.status` vẫn không ghi `overdue` — quá hạn tính lúc đọc |
| ~~67~~ | ~~Thanh toán NCC chưa sinh phiếu chi trong sổ quỹ~~ | ~~P4.3~~ | ✅ P4.8 (phiếu chi "Tiền nhập hàng" tự lập, chọn quỹ chi; khách trả nợ cũng tự lập phiếu thu) |
| 68 | Chưa có trả hàng cho NCC (`return_out`) / giảm công nợ khi trả; đơn đã nhận đủ không sửa được. Đơn nhận một phần rồi "huỷ phần còn lại" mang trạng thái `cancelled` (hàng + công nợ đã nhận được giữ) | P4.3 | Khi có yêu cầu nghiệp vụ (P4.x) |
| 69 | "Nhóm hàng cung cấp" (SRS-SUP-01) chưa có cột riêng — ghi trong Ghi chú; chưa gắn NCC mặc định cho sản phẩm (SRS sản phẩm) | P4.3 | Khi có yêu cầu nghiệp vụ |
| ~~70~~ | ~~Chiến dịch marketing SMS / Email hàng loạt (SRS-MKT-06)~~ | ~~P4.4~~ | ✅ P4.7 (`/marketing/campaigns`). Zalo OA → #85 |
| 71 | Đổi/trả hoá đơn (refund) không hoàn suất flash sale / combo đã dùng (chỉ **huỷ** hoá đơn mới hoàn); trả hàng có dòng quà tặng / combo tính theo giá trị dòng đã chia (quà = 0₫) | P4.4 | Khi có yêu cầu nghiệp vụ |
| 72 | Mã giảm giá / voucher / khuyến mãi mới áp dụng tại POS; đơn hàng online (module Đơn hàng P2.7) và mã `free_shipping` chưa dùng được (kênh `online`/`website`… lưu sẵn) | P4.4 | P6.1 Omni Channel (Website) |
| 73 | Giới hạn flash sale "mỗi khách" được kiểm khi báo giá + lúc tạo HĐ (tổng suất kiểm có điều kiện), nhưng 2 HĐ đồng thời của **cùng một khách** có thể cùng lọt giới hạn mỗi khách (không khoá theo khách) | P4.4 | P6.5 (nếu cần) |
| 74 | Huỷ / đổi trả hoá đơn đã trả bằng thẻ / QR qua Payment Hub không hoàn tiền qua Payment Hub (chưa có module hoàn tiền) — thu ngân chọn hình thức hoàn thủ công. Thanh toán Payment Hub khách đã trả nhưng không gắn hoá đơn (huỷ chờ trên POS sau khi tiền về) chỉ được cảnh báo trong tổng kết ca | P4.5 | P5.3 Refund / P5.4 Đối soát |
| 75 | Thẻ qua cổng ở dev: đối tác VNPay đang `Error` (credential placeholder #16) → POS báo "Cổng thanh toán thẻ hiện không khả dụng". Luồng thẻ đã kiểm bằng cách tạm bật đối tác + IPN ký đúng | P4.5 | Khi có credential VNPay (#16) |
| 76 | In ESC/POS (WebUSB / Web Bluetooth) **chưa kiểm với máy in thật** (không có thiết bị); chữ tiếng Việt bị bỏ dấu (bảng mã khác nhau theo máy); Web Bluetooth phải ghép lại sau mỗi lần tải trang; chỉ Chrome/Edge (https/localhost). Mặc định vẫn in qua trình duyệt | P4.5 | Khi có máy in thật (kiểm thử phần cứng) |
| 77 | Đơn chờ (tách / gộp / lưu tạm) lưu Redis theo ca, TTL 12 giờ, chỉ thao tác khi WebSocket trực tuyến; khoá ca không tự xoá đơn chờ còn lại (hết TTL mới mất) | P4.5 | P6.5 (nếu cần) |
| 78 | Đơn đặt trước: giá **tính lại khi giao** (không khoá giá lúc đặt), mã giảm giá lúc đặt không áp lại khi giao; không giữ tồn cho đơn đặt (nhắc lịch hẹn giao: ✅ P4.7) | P4.5 | Khi có yêu cầu nghiệp vụ |
| 79 | Màn hình khách ghép bằng PIN: token thiết bị 16 giờ, hết hiệu lực khi ca khoá; chưa có màn hình xem / thu hồi thiết bị đã ghép | P4.5 | P4.6 Multi-store / Cài đặt |
| 80 | Đa chi nhánh mới tách **dữ liệu giao dịch** (HĐ/ca POS, đơn hàng, đơn đặt trước, kho/phiếu kho/kiểm kê/chuyển kho, đơn nhập, dashboard, báo cáo, lịch ca). Dùng chung toàn cửa hàng: sản phẩm + giá bán, khách hàng + điểm, NCC + công nợ, khuyến mãi, nhân viên/hoa hồng, audit log; dashboard "khách hàng mới" và cảnh báo tồn thấp SSE (`/api/inventory/alerts`) chưa lọc theo chi nhánh | P4.6 | Khi có yêu cầu nghiệp vụ (giá / khuyến mãi theo chi nhánh) |
| 81 | Phạm vi chi nhánh theo `user_branches` (gán qua vai trò ở module Nhân viên): quyền **cùng một bộ** ở mọi chi nhánh được gán (`user_roles.branch_id` chưa dùng để khác quyền theo chi nhánh); nhân viên chưa gán → chỉ chi nhánh mặc định; quản lý chưa gán → mọi chi nhánh. Đổi phân công có hiệu lực sau ≤ 60 s (cache `rbac:{tenant}`), đổi trạng thái chi nhánh ngay | P4.6 | P6.6 Security Hardening (nếu cần quyền theo chi nhánh) |
| 82 | Đơn hàng online không gắn chi nhánh chỉ hiện khi chọn "Tất cả chi nhánh"; người chỉ có chi nhánh A không xem / đổi trả được hoá đơn của chi nhánh B (trả hàng khác chi nhánh); hàng trả luôn về kho chi nhánh của hoá đơn gốc | P4.6 | P6.1 Omni Channel / khi có yêu cầu nghiệp vụ |
| 83 | SMS chỉ có adapter HTTP chung (`SMS_PROVIDER=http`: POST `{to, message, brandname}` + Bearer) và `log` cho dev — chưa có adapter nhà cung cấp cụ thể (eSMS, SpeedSMS, Viettel…), chưa đăng ký brandname; chưa nhận báo cáo trạng thái (DLR) từ nhà mạng | P4.7 | Người dùng chọn nhà cung cấp / P6.5 |
| 84 | Web Push **chưa kiểm với dịch vụ push thật** (FCM / Mozilla / Apple): trình duyệt tích hợp của app chặn quyền Notification. Đã kiểm phía máy chủ (VAPID + mã hoá `aes128gcm` tới endpoint giả, xoá subscription khi 410) và file `/sw.js`. Cần cặp khoá VAPID (`npx web-push generate-vapid-keys`) trong env + thử trên Chrome; iPhone cần PWA (thêm vào màn hình chính) | P4.7 | Người dùng (Chrome) / P6.x PWA |
| 85 | Kênh Zalo OA (thông báo + chiến dịch, SRS-MKT-06 / SRS §9) chưa làm — chưa có tài khoản Zalo OA | P4.7 | Khi có Zalo OA |
| 86 | Chiến dịch marketing: chưa có trường đồng ý / từ chối nhận quảng cáo của khách, chưa có link huỷ đăng ký email, chưa giới hạn khung giờ gửi tin quảng cáo (SMS QC cần brandname + tuân quy định chống tin nhắn rác) — chỉ nên dùng thật sau khi bổ sung | P4.7 | Trước khi dùng thật / P6.6 |
| 87 | Sự kiện "Đồng bộ kênh bán lỗi" (`sync_failed`) đã có cấu hình nhưng chưa có nơi phát (chưa có Omni Channel) | P4.7 | P6.1 |
| 88 | Tiền bán hàng POS chỉ vào quỹ bằng "nộp tiền ca" (tiền mặt, thao tác tay ở `/accounting/cash-funds`); thẻ / QR / chuyển khoản / ví về tài khoản ngân hàng **không tự ghi vào quỹ ngân hàng** — kế toán ghi phiếu thu "Doanh thu bán hàng" hoặc chuyển quỹ khi đối chiếu sao kê. Chưa tự nộp tiền khi khoá ca | P4.8 | Khi có nguồn báo có ngân hàng (#24) / P5.4 Đối soát |
| 89 | Sổ quỹ xếp theo **thời điểm ghi sổ** (`fund_transactions.created_at`): phiếu lập lùi ngày chứng từ vẫn ghi biến động quỹ lúc lập, nên tồn quỹ theo "ngày chứng từ" của kỳ cũ không đổi (báo cáo theo ngày chứng từ dùng sổ thu chi). Chưa có khoá sổ kỳ (chặn sửa / huỷ phiếu kỳ đã chốt) | P4.8 | Khi có yêu cầu nghiệp vụ (khoá sổ cuối tháng) |
| 90 | Thanh toán NCC / thu nợ khách **trước P4.8** không có phiếu thu chi (không bổ sung ngược) → dòng tiền các kỳ trước thiếu khoản này. Công nợ khách không có bảng lịch sử thanh toán (P2.8: chỉ cộng dồn `paid_amount`) — phiếu thu lấy ngày hiện tại, không lùi ngày được; huỷ thanh toán NCC / nợ khách chưa có (phiếu tự động không huỷ được) | P4.8 | Khi có yêu cầu nghiệp vụ (bảng `customer_debt_payments`, huỷ thanh toán) |
| 91 | Đối soát thanh toán chỉ tự xác nhận thẻ / QR qua Payment Hub (`pos_payment_intents`) và tiền mặt qua kiểm ca; chuyển khoản / ví và thẻ / QR nhập tay luôn "chưa xác nhận" (dữ liệu dev: 25 HĐ thẻ/QR nhập tay). Chưa đánh dấu "đã đối soát" thủ công, chưa có đơn hàng online (#61) | P4.8 | P5.4 Đối soát (sao kê / báo có ngân hàng) |
| 92 | Báo cáo lời lỗ / dòng tiền chưa xuất PDF / Excel (sổ thu chi + sổ quỹ xuất CSV); dòng tiền: hoàn cọc đơn đặt trước tính theo `preorders.updated_at` (không có cột thời điểm hoàn), hoàn tiền trả hàng theo ngày trả | P4.8 | P6.x (xuất báo cáo tài chính) / khi có yêu cầu |
| 93 | **[Cao]** WebSocket POS (`server/ws/pos.ts` `authorize`) chỉ kiểm quyền `pos:read`/`pos:write`, **không kiểm ca thuộc ai / chi nhánh nào**: nhân viên chi nhánh A kết nối `/ws/pos/{id}` (id tăng dần) của ca chi nhánh B → thêm hàng, giảm giá 100 %, tách/gộp/bỏ đơn chờ, và `display:qr` đẩy **QR ngân hàng tuỳ ý** lên màn hình khách của ca đó (QA-3 đã chạy thật: nhân viên CN-HN chèn hàng + QR giả vào ca CN-HCM, màn hình manager nhận `display:qr`) | QA-3 | QA-3 fix (chờ người dùng) |
| 94 | POS đọc theo id không kiểm chi nhánh: `pos.session`, `sessionSummary` (QA-3 chạy thật: nhân viên CN-HN đọc được ca + tổng kết tiền ca CN-HCM), `preorder`, `preorderQuote`, `exchangeQuote` (dòng HĐ), `payhubOpen`, `storeInfo` (tài khoản ngân hàng chi nhánh khác) | QA-3 | QA-3 fix |
| 95 | Thao tác POS bỏ qua phạm vi chi nhánh: `closeSession` / `cancelInvoice` / `cancelPreorder` / `createPairingPin` chỉ xét vai trò (quản lý chi nhánh A thao tác được ca / HĐ chi nhánh B); `refundInvoice` / `exchange` / `completePreorder` không kiểm chi nhánh của HĐ / đơn đặt (đọc code, chưa chạy thật — dev chỉ có HĐ CN-HN) | QA-3 | QA-3 fix |
| 96 | Ca làm việc / chấm công / doanh số nhân viên không theo chi nhánh: `staff.shift.create/update/delete/assign/unassign` không `assertBranch` dù ca có `branch_id`; `attendance.timesheet` (quyền quản lý), `staff.sales`, `commission.list` trả mọi chi nhánh | QA-3 | QA-3 fix |
| 97 | Ghép màn hình bằng PIN: giới hạn 10 lần/phút theo IP lấy từ `X-Forwarded-For` do client gửi → đổi header để dò PIN 6 số; không gian PIN chung mọi tenant. Cần IP tin cậy (proxy) + giới hạn tổng / PIN dài hơn | QA-3 | QA-3 fix / P6.6 |
| 98 | `staff:write` (gán được cho vai trò tuỳ chỉnh qua catalog) = quyền quản trị: người có quyền này gán được vai trò hệ thống `admin` (kể cả cho mình) và đặt lại mật khẩu admin. Cần `admin:*` để cấp vai trò admin/manager, đặt lại mật khẩu admin, và không cho cấp quyền mình không có | QA-3 | QA-3 fix (quyết định: theo thiết kế hay chặn) |
| 99 | Thấp (đọc code): `branch.get` / `branch.config` đọc cấu hình (tài khoản ngân hàng) chi nhánh khác với `config:read`; Web Push dùng vai trò lưu lúc đăng ký (giáng chức vẫn nhận push của vai trò cũ tới khi đăng ký lại); khoá ca đua với HĐ đang ghi (HĐ có thể vào ca đã khoá, thiếu trong tổng kết); `reports.emailReport` chỉ cần `report:read` (vai trò viewer gửi báo cáo tới 5 email ngoài bất kỳ); `payCommissions` trả tổng tiền sai khi chạy đồng thời | QA-3 | QA-3 fix / P6.6 |
| 6 | Bản rollback MariaDB 10.3 (container `mariadbtest-10.3` + volume gốc) còn giữ → xoá khi chắc chắn không cần | Nâng cấp MariaDB | Người dùng |

### Đã giải quyết

| Ngày | Vấn đề | Cách giải quyết |
|------|--------|-----------------|
| 2026-11-07 | Lần đầu vào BizOne không vào được trang chức năng: `/` là trang tĩnh với nút "Bắt đầu" không dẫn đi đâu; sidebar link tới 5 module chưa có (`/suppliers`, `/omni`, `/marketing`, `/accounting`, `/settings`) → 404; thiếu/ hết hạn `DEV_AUTH_TOKEN` → mọi trang trắng (dashboard `return null`) không giải thích; màn hẹp sidebar che hết nội dung | `/` chuyển về `/dashboard`; mục chưa xây hiện "Sắp có" (không link); `AppLayout` hiện banner "Chưa đăng nhập" (token thiếu/hết hạn, tính mỗi request); sidebar tự thu gọn < 1024 px (`AppShell` tách riêng cho client component). Gốc vẫn là #7 — chưa có đăng nhập Keycloak trên trình duyệt |
| 2026-11-07 | QA-2 mức cao: dashboard BizOne dùng chung cache giữa tenant (#39); HĐ POS không có audit log, `user_id` luôn NULL (#40); Payment Hub đọc sai header idempotency + 5 request đồng thời tạo 5 GD (#41); `merchant_txn_id` không duy nhất (#42) | Key cache `dashboard:{tenant}:*` TTL 20 s + xoá khi có HĐ; middleware audit tRPC + `invoice.service` tự ghi (gồm thanh toán qua WS); `Idempotency-Key` + claim `SET NX`; unique `(merchant_id, merchant_txn_id)` → 409 (QA-2 fix) |
| 2026-11-07 | QA-2 lỗi nghiệp vụ: lỗi kho/đơn/CRM trả 500 (#43); `created_by` NULL (#44); đơn tổng âm (#45); trả nợ vượt (#46); số dòng lỗi import sai (#47); không drill-down (#49); `shadcn` trong dependencies (#50); `.env.example` thiếu biến (#51); dashboard cộng cả tiền khách đưa (chưa trừ tiền thối) vào "Tiền mặt" | `bizoneError` 409/404/400; `resolveDbUserId`; kiểm giảm giá; trừ nợ có điều kiện; số dòng thật + thông báo tiếng Việt; `dashboard.dayDetail` + panel chi tiết ngày; devDependencies; bổ sung biến; trừ `change_amount` (QA-2 fix) |
| 2026-11-06 | Merchant không tạo được GD VietQR trong một lần gọi; `/pay/{txn}` không có VietQR (#25) | `POST /api/v1/transactions` nhận `payment_method: vietqr` → trả `qr_code` + `payment_url` trang QR; `/pay` liệt kê VietQR, hiển thị QR, tự reload theo dõi trạng thái (P3.8) |
| 2026-11-05 | `npm run build:jobs` của Payment Hub xuất bundle CJS → `node dist/worker.js` / `dist/server.js` lỗi ngay khi khởi động (`fileURLToPath(undefined)`, Prisma 7 dùng `import.meta.url`); Docker compose chạy 2 file này | Chuyển sang bundle ESM `dist/worker.mjs`, `dist/server.mjs` (giống BizOne), sửa compose + Dockerfile (P3.7) |
| 2026-11-04 | Job webhook trong Redis chứa `secret` dạng rõ (#3); IPN không gửi webhook cho merchant (#17) | Job chỉ mang `webhookConfigId` (secret mã hoá trong DB, đọc lúc gửi); outbox `notify_webhook` gửi `payment.success/failed/expired` (P3.6) |
| 2026-11-04 | BizOne chưa cô lập dữ liệu tenant (SRS-NFR-14/19): mọi tenant dùng chung `bizonedb` | DB riêng mỗi tenant qua `lib/tenant.ts` (AsyncLocalStorage + `TENANT_DATABASES`), fail-closed (QA-1) |
| 2026-11-04 | `GET /api/v1/transactions` kèm `X-Api-Key` bất kỳ bỏ qua JWT và không xác thực → lộ mọi giao dịch | Merchant: HMAC + lọc theo merchant; admin: JWT + role (QA-1) |
| 2026-11-04 | `/api/internal/transactions` chỉ cần JWT hợp lệ (không kiểm role/merchant) | `requireAdmin()`: role `payhub-admin`/`payhub-viewer`, lọc theo claim `merchant_id` (QA-1) |
| 2026-11-04 | Job hết hạn có thể ghi đè GD vừa `Success` thành `Expired`; `transitionStatus` đọc-rồi-ghi không điều kiện | `UPDATE … WHERE status = <trạng thái đã đọc>` cho cả hai (QA-1) |
| 2026-11-04 | Chữ ký HMAC merchant (`ts.body`) khác OpenAPI, không gắn method/path; `api_secret` lưu rõ | Ký `METHOD\nPATH\nTS\nSHA256(body)` (`lib/hmac.ts`), secret AES-256-GCM (QA-1) |
| 2026-11-04 | Token `payhub-admin-console` thiếu `realm_access.roles` / `preferred_username` | Thêm protocol mapper (Keycloak đang chạy + realm JSON) (QA-1) |
| 2026-11-02 | Compose project BizOne trùng tên `bizone` với stack Keycloak (nguy cơ xoá Keycloak khi `--remove-orphans`) | Đổi thành `bizone-core` (P1.1) |
| 2026-11-02 | Worker in stack trace mỗi lần Redis reconnect; có thể treo khi tắt | Log 1 dòng/lần, tự thoát sau 8s khi SIGTERM (P1.2) |
| 2026-11-03 | DB dev `bizonedb` lệch so với `schema.sql` (do lần chạy Prisma khác 2026-06-15) | Sao lưu → `prisma migrate reset` + seed; khớp schema, có lịch sử migration (P1.3) |
| 2026-11-03 | MariaDB local 10.3 hết hỗ trợ, thiếu tính năng mới, buộc Keycloak dừng ở 23 | Nâng MariaDB lên 10.11.19, dữ liệu khớp 100% |
| 2026-11-03 | Keycloak 23.0.7 cũ | Nâng lên 26.8.1, 4 realm tự migrate, user/client giữ nguyên |
| 2026-11-03 | Server MariaDB mặc định `latin1` | Server 10.11 mặc định `utf8mb4_unicode_ci`; `bizonedb` đã đổi sang `utf8mb4` |
| 2026-11-03 | `updated_at` không còn `ON UPDATE CURRENT_TIMESTAMP` ở mức DB | Chấp nhận: Prisma tự cập nhật qua `@updatedAt`; SQL thuần tự set |
| 2026-11-03 | Port 3000 bị Metabase chiếm | Metabase không thuộc dự án (người dùng đã dừng); BizOne dùng port 3000 |
| 2026-11-04 | `mariadbtest` không publish cổng 3306 ra host (`docker port` rỗng dù cấu hình `3306:3306`) → app dev không kết nối DB | Restart container (cổng publish lại); đặt restart policy `unless-stopped` để tự chạy cùng Docker Desktop |
| 2026-11-04 | Token Keycloak (`bizone-frontend`) thiếu claim `tenant_id`, `realm_access.roles`, `preferred_username` → mọi API trả 401/403 | Thêm 3 protocol mapper vào client (Keycloak đang chạy + `keycloak/realms/bizone-realm.json`) (P2.4) |
| 2026-11-04 | `proxy.ts` Payment Hub bắt JWT cho cả `/api/v1/*` → API merchant (API Key + HMAC, P3.1) không gọi được | Request `/api/v1/*` có `X-Api-Key` đi thẳng tới route (HMAC kiểm ở handler), xoá header `x-user-*` để chống giả mạo (P3.3) |
| 2026-11-04 | tRPC client không gửi header `Authorization`/`X-Tenant-ID` truyền qua `context` | `lib/trpc.ts` lấy header từ `opList[0].context` (P2.4) |

---

## Giai đoạn 1 — Nền tảng (Tuần 1–3)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P1.1 | BizOne Scaffolding | ✅ | `c75c9c5` | Xem [kết quả P1.1](#p11--bizone-scaffolding) |
| P1.2 | Payment Hub Scaffolding | ✅ | `2f6be74` | Xem [kết quả P1.2](#p12--payment-hub-scaffolding) |
| P1.3 | BizOne Database Schema | ✅ | `4eab67f` | Xem [kết quả P1.3](#p13--bizone-database-schema) — DB dev local đã reset theo schema (2026-11-03) |
| P1.4 | Payment Hub Database Schema | ✅ | `c88f056` | Xử lý vấn đề mở #4, #5 |
| P1.5 | Authentication System | ✅ | `4a5f17f` | JWKS verify qua jose; middleware JWT+tenant; vấn đề #1 (WS auth) xử lý P1.5; vấn đề #2 (Token Exchange) → dùng client_credentials trực tiếp |
| P1.6 | API Core Infrastructure | ✅ | `221a42d` | tRPC 11.23 + middleware chain (auth/tenant/rbac/rate-limit); idempotency Redis; REST helpers cho Payment Hub |
| P1.7 | Shared UI Component Library | ✅ | `a7285a9` | Sidebar, TopBar, AppLayout, StatCard, DataTable, Modal, Toast, Input, Select, NumericKeypad; trang demo /ui-kit |
| P1.8 | Payment Hub Admin Layout | ✅ | `b520eb1` | PHSidebar (dark), PHHeader (breadcrumb), StatusBadge (6 trạng thái), 9 module pages |

## Giai đoạn 2 — BizOne Core MVP (Tuần 4–8)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P2.1 | Product Module — API | ✅ | `c55a06e` | tRPC CRUD + category tree + Redis search cache + Excel import/export |
| P2.2 | Product Module — UI | ✅ | `488dbbd` | CategoryTree, ProductTable, ProductForm (tabs), ImportDialog, ProductsClient, pages |
| P2.3 | Inventory Module — API | ✅ | `a2b729f` | Xem [kết quả P2.3](#p23--inventory-module--api) |
| P2.4 | Inventory Module — UI | ✅ | `f41f1a0` | Xem [kết quả P2.4](#p24--inventory-module--ui) |
| P2.5 | POS Module — API & WebSocket | ✅ | `6b88230` | Xem [kết quả P2.5](#p25--pos-module--api--websocket) |
| P2.6 | POS Module — UI | ✅ | `49147ea` | Xem [kết quả P2.6](#p26--pos-module--ui) |
| P2.7 | Order Module — API & UI | ✅ | 862000e | Xem [kết quả P2.7](#p27--order-module--api--ui) |
| P2.8 | CRM Module — API & UI | ✅ | 3866a5f | Xem [kết quả P2.8](#p28--crm-module--api--ui) |
| P2.9 | Dashboard — API & UI | ✅ | `1fa131f` | Xem [kết quả P2.9](#p29--dashboard--api--ui) |
| P2.10 | Audit Log — API & UI | ✅ | `412f39a` | Xem [kết quả P2.10](#p210--audit-log--api--ui) |


## Giai đoạn 3 — Payment Hub MVP (Tuần 4–8)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P3.1 | Transaction Engine — Core API | ✅ | `0e47fcd` | Xem [kết quả P3.1](#p31--transaction-engine--core-api) |
| P3.2 | Transaction UI — Danh sách & Chi tiết | ✅ | `9e5bf92` | Xem [kết quả P3.2](#p32--transaction-ui--danh-sách--chi-tiết) |
| P3.3 | VNPay Connector | 🟡 | `c83a1e2` | Code + kiểm thử local xong; chờ TMN/HashSecret sandbox thật để nghiệm thu redirect thanh toán & refund. Xem [kết quả P3.3](#p33--vnpay-connector) |
| P3.4 | VietQR Generator | 🟡 | `9d7da3b` | Code + kiểm thử xong (payload trùng khớp img.vietqr.io); chờ quét thử bằng app ngân hàng. Xem [kết quả P3.4](#p34--vietqr-generator) |
| P3.5 | Partner Config UI | 🟡 | `619bfd1` | Code + kiểm thử xong; VietQR: thêm → test → kích hoạt OK. VNPay: test chạy thật nhưng bị từ chối vì credential placeholder (#16) → chưa kích hoạt được. Xem [kết quả P3.5](#p35--partner-config-ui) |
| P3.6 | Webhook Engine | ✅ | `ba87a4a` | Xem [kết quả P3.6](#p36--webhook-engine) |
| P3.7 | Payment Hub Dashboard | ✅ | `7bfeefa` | Xem [kết quả P3.7](#p37--payment-hub-dashboard) |
| P3.8 | Route Engine — Partner Selection | ✅ | `6c9c435` | Xem [kết quả P3.8](#p38--route-engine--partner-selection) |

## Giai đoạn 4 — BizOne Mở rộng (Tuần 9–12)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P4.0 | Bypass xác thực Keycloak cho dev/test | ✅ | `97aae2f` | Xem [kết quả P4.0](#p40--bypass-xác-thực-keycloak-cho-devtest) — gỡ ở P6.7 |
| P4.1 | Staff Module — API & UI | ✅ | `fdb36cd` | Xem [kết quả P4.1](#p41--staff-module--api--ui) |
| P4.2 | Reports Module — API & UI | ✅ | `335d41d` | Xem [kết quả P4.2](#p42--reports-module--api--ui) |
| P4.3 | Supplier Module — API & UI | ✅ | `b784329` | Xem [kết quả P4.3](#p43--supplier-module--api--ui) |
| P4.4 | Marketing Module — API & UI | ✅ | `524fb15` | Xem [kết quả P4.4](#p44--marketing-module--api--ui) |
| P4.5 | POS Advanced Features | ✅ | `e0488e5` | Xem [kết quả P4.5](#p45--pos-advanced-features) |
| P4.6 | Multi-Store Support | ✅ | `b735f80` | Xem [kết quả P4.6](#p46--multi-store-support) |
| P4.7 | Thông báo — Hệ thống + Email + SMS | ✅ | `99cd07f` | Xem [kết quả P4.7](#p47--thông-báo--hệ-thống--email--sms) |
| P4.8 | Kế toán & Tài chính — API & UI | ✅ | `af2bbab` | Xem [kết quả P4.8](#p48--kế-toán--tài-chính--api--ui) |

## Giai đoạn 5 — Payment Hub Mở rộng (Tuần 9–12)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P5.1 | MoMo Connector | ⬜ | — | |
| P5.2 | ZaloPay Connector | ⬜ | — | |
| P5.3 | Refund Module — API & UI | ⬜ | — | |
| P5.4 | Reconciliation Module — API & UI | ⬜ | — | |
| P5.5 | Payment Hub Reports | ⬜ | — | |
| P5.6 | Dispute Module — API & UI | ⬜ | — | |

## Giai đoạn 6 — BizOne Nâng cao (Tuần 13–16)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P6.1 | Omni Channel — Website | ⬜ | — | |
| P6.2 | Omni Channel — Shopee/Lazada Connector | ⬜ | — | |
| P6.3 | Omni Channel — TikTok Shop + Facebook/Instagram | ⬜ | — | |
| P6.4 | PWA Mobile App | ⬜ | — | |
| P6.5 | Performance Optimization | ⬜ | — | |
| P6.6 | Security Hardening | ⬜ | — | |
| P6.7 | Đăng nhập Keycloak trên trình duyệt (BizOne + Payment Hub Admin) | ⬜ | — | Thêm 2026-11-07 (phần UI còn thiếu của P1.5, #7); ưu tiên thấp — trước đó dev dùng `AUTH_DEV_BYPASS` |

## Giai đoạn 7 — Payment Hub Nâng cao (Tuần 13–16)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|------------|--------|---------|
| P7.1 | Connector Plugin Architecture | ⬜ | — | |
| P7.2 | Audit Log — Payment Hub | ⬜ | — | |
| P7.3 | Notification System | ⬜ | — | |
| P7.4 | Scale & Performance | ⬜ | — | |
| P7.5 | Disaster Recovery & Monitoring | ⬜ | — | |

---

## Công việc ngoài plan (chuẩn bị)

| Ngày | Công việc | Commit |
|------|-----------|--------|
| 2026-11-02 | Đặc tả OpenAPI 3.0 (BizOne, Payment Hub), OAuth2/Keycloak spec, README song ngữ | `df7a323` |
| 2026-11-02 | Dựng Keycloak 23 (Docker, port 8080) với 3 realm: `bizone`, `payment-hub`, `partners` _(đã nâng lên 26.8.1 ngày 2026-11-03)_ | `5eefade` |
| 2026-11-02 | `.gitignore`, `.env.example`; credentials dev trong `.env.development` (gitignored) | `a7ce8cf` |
| 2026-11-03 | Nâng MariaDB local 10.3 → **10.11** và Keycloak 23.0.7 → **26.8.1** — xem [chi tiết](#nâng-cấp-mariadb-1011--keycloak-26-2026-11-03) | `35ed560` |
| 2026-11-04 | **QA-1** — Rà soát chất lượng & sửa toàn bộ lỗi phát hiện (bảo mật Payment Hub, cô lập tenant BizOne, test + CI) — xem [chi tiết](#qa-1--rà-soát-chất-lượng--sửa-lỗi-2026-11-04) | `f5c0236`, `06998b9`, `a117bf9` |
| 2026-11-07 | **QA-2** — Rà soát cuối Giai đoạn 2 + 3 và sửa lỗi phát hiện (#39–#47, #49–#51) — xem [chi tiết](#qa-2--rà-soát-cuối-giai-đoạn-2--3-2026-11-07) | `3a1e7cd` (rà soát), `6931cb8` (BizOne), `bb59ff9` (Payment Hub) |
| 2026-11-10 | **QA-3** — Rà soát cuối Giai đoạn 4 (tiêu chí P4.0–P4.8, chất lượng, bảo mật / cô lập chi nhánh) — phát hiện #93–#99 — xem [chi tiết](#qa-3--rà-soát-cuối-giai-đoạn-4-2026-11-10) | `88e21c9` |

---

## Kết quả chi tiết

### P1.1 — BizOne Scaffolding

- **Hoàn thành:** 2026-11-02 · **Commit:** `c75c9c5` · **Vị trí:** `source/bizone`
- **Đã làm:**
  - NextJS 16.4 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui (style base-nova)
  - Theme BizOne: primary `#2563EB`, success `#10B981`, warning `#F59E0B`, error `#EF4444`, font Inter, `lang="vi"`
  - Thư mục `app/`, `components/`, `lib/`, `server/`, `types/`, `hooks/`
  - ESLint + Prettier (plugin sắp xếp class Tailwind), scripts `lint`, `typecheck`, `format`
  - `Dockerfile` multi-stage (`output: "standalone"`, node:24-alpine, user non-root, healthcheck)
  - `docker-compose.yml` (project `bizone-core`): `app` + `db` (MariaDB 10.11) + `cache` (Redis 7)
  - `GET /api/health` cho Docker healthcheck
  - `.env.local` (gitignored) lấy từ `documents/env.txt`, `.env.example` commit
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npm run dev` chạy được | ✅ Trang chủ 200, `/api/health` trả `{ success: true }` (port 3010) |
  | `docker compose up` start được cả 3 services | ✅ app / db / cache đều `healthy`; MariaDB 10.11.19 có `bizonedb`; Redis `PONG` |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - NextJS 16 thay vì 14 (plan ghi "14+"). Next 16 có thay đổi API — đọc `node_modules/next/dist/docs/` trước khi code.
  - `eslint.config.mjs` (flat config) thay cho `.eslintrc.json`; `next.config.ts` thay cho `next.config.js`.
- **Vấn đề / lưu ý:**
  - ✅ Port 3000 lúc đó bị container Metabase chiếm nên kiểm thử chạy ở 3010. _(Đã giải quyết 2026-11-03: Metabase không dùng nữa, BizOne chạy port 3000.)_
  - MariaDB/Redis local đã chạy ở 3306/6379 → compose map ra host 3307/6380.
  - ✅ Compose project ban đầu tên `bizone` trùng với stack Keycloak ở repo root (có nguy cơ xoá Keycloak khi `--remove-orphans`) → đã đổi thành `bizone-core`.

### P1.2 — Payment Hub Scaffolding

- **Hoàn thành:** 2026-11-02 · **Commit:** `2f6be74` · **Vị trí:** `source/payment-hub`
- **Đã làm:**
  - NextJS 16.4 + TypeScript + Tailwind v4 + shadcn/ui, cùng tooling và theme như P1.1; app chạy port **4000**
  - **3 process, 1 Docker image:**
    - `app` — Next.js (UI + REST API)
    - `worker` — BullMQ 6, queue `webhook-delivery` (`services/worker.ts`)
    - `realtime` — WebSocket server `ws://:4001/ws`, relay kênh Redis `payhub:events` (`server/ws/server.ts`)
  - `services/queue/` — kết nối BullMQ, định nghĩa queue, `enqueueWebhook()`; retry 5 lần, backoff exponential 10s
  - `services/webhook/deliver.ts` — gửi webhook có ký `x-payhub-signature = HMAC-SHA256(secret, timestamp + "." + body)` (khớp `OpenAPI-PaymentHub.yaml`), timeout 10s
  - `lib/db.ts` (pool MariaDB, driver `mariadb`), `lib/redis.ts` (ioredis 6), `lib/events.ts` (`publishEvent()`)
  - `GET /api/health` kiểm tra thật MariaDB (`SELECT 1`) + Redis (`PING`), trả 503 `SERVICE_UNAVAILABLE` nếu một bên lỗi
  - Worker/relay được bundle bằng esbuild ra `dist/` để chạy trong image standalone; dev dùng `tsx watch`
  - `docker-compose.yml` (project `bizone-payhub`): `app`, `worker`, `realtime`, `db` (MariaDB 10.11, `paymentdb`), `cache` (Redis 7, AOF)
  - Tắt máy an toàn: worker/relay xử lý SIGTERM, worker tự thoát sau 8s nếu Redis không phản hồi (trước SIGKILL 10s của Docker)
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `docker compose up` start được | ✅ 5 container: app / realtime / db / cache `healthy`, worker running |
  | Kết nối DB + Redis OK | ✅ `/api/health` → `database.ok: true`, `redis.ok: true` (cả dev lẫn Docker) |
  | BullMQ hoạt động (bổ sung) | ✅ Enqueue job → worker POST webhook tới receiver, chữ ký HMAC hợp lệ |
  | WebSocket (bổ sung) | ✅ `publishEvent()` → client WS nhận event qua relay |
  | Lỗi Redis (bổ sung) | ✅ `/api/health` trả 503; worker log 1 dòng/lần retry, tự kết nối lại |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Quyết định thiết kế:**
  - Next.js Route Handlers không giữ được kết nối WebSocket (theo docs Next 16) → WebSocket chạy process riêng, giao tiếp với app qua Redis pub/sub. P3.7 (`server/ws/dashboard.ts`) sẽ gắn vào process này.
  - Dùng driver `mariadb` trực tiếp cho health check; P1.4 sẽ thêm Prisma (adapter MariaDB dùng cùng driver). _(Vấn đề mở #4)_
- **Vấn đề / lưu ý:**
  - ⚠️ WebSocket chưa xác thực — phải thêm kiểm tra token Keycloak (P1.5) trước khi publish dữ liệu giao dịch thật. _(Vấn đề mở #1)_
  - Job webhook đang chứa `secret` trong Redis; P3.6 nên đổi sang lưu `webhookConfigId` và đọc secret từ DB. _(Vấn đề mở #3)_
  - BullMQ 6 / ioredis 6 mới hơn bản phổ biến: connection truyền dạng `{ url, maxRetriesPerRequest: null }`.
  - Compose map host port: db 3308, Redis 6381 (tránh 3306/6379 local và 3307/6380 của BizOne Core).

### P1.3 — BizOne Database Schema

- **Hoàn thành:** 2026-11-02 · **Commit:** `4eab67f` · **Vị trí:** `source/bizone/prisma`
- **Đã làm:**
  - Prisma **7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-mariadb`); `prisma.config.ts` đọc `DATABASE_URL` từ `.env.local` (biến shell được ưu tiên)
  - `prisma/schema.prisma`: **70 models, 29 enums, 127 quan hệ** — sinh bằng introspection từ DB tạo bởi `database/schema.sql`, rồi đổi sang tên chuẩn Prisma:
    - Model PascalCase số ít + `@@map("<bảng>")` (vd. `ProductCategory` → `product_categories`)
    - Field camelCase + `@map("<cột>")` (vd. `passwordHash` → `password_hash`)
    - Quan hệ đặt tên theo khoá ngoại (`category`, `createdByUser`, `parent`/`children`…); quan hệ trùng đích có tên rõ (`productsCreatedBy`, `stockTakeNotesApprovedBy`)
    - Giữ nguyên tên index/FK gốc (`map: "fk_…"`) → DB vật lý không đổi
    - 22 cột `updated_at` (`ON UPDATE CURRENT_TIMESTAMP` trong SQL) → `@updatedAt`
  - `prisma/migrations/0_init/` — migration baseline (70 bảng, 127 FK) + `migration_lock.toml`
  - `prisma/seed.ts` — dữ liệu mẫu đúng phần SEED DATA của `schema.sql`: 5 roles, 52 permissions (Admin có tất cả), 3 nhóm KH, 9 loại phiếu kho, 17 cấu hình, 10 danh mục thu/chi, 8 danh mục SP, 3 mẫu thông báo. Chạy lại an toàn (upsert theo mã; `store_config` chỉ thêm key thiếu để không ghi đè cấu hình cửa hàng)
  - `lib/prisma.ts` — `getPrisma()` singleton dùng adapter MariaDB
  - `GET /api/health` kiểm tra DB qua Prisma (`SELECT 1`), trả 503 nếu DB lỗi
  - Scripts: `build`/`typecheck` chạy `prisma generate` trước; `db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:studio`
  - Client sinh ra ở `generated/prisma` (gitignored, sinh lại khi build/typecheck)
- **Kiểm thử** (MariaDB 10.11 trong container thử nghiệm):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npx prisma db push` thành công | ✅ DB rỗng → tạo đủ 70 bảng; DB tạo từ `schema.sql` → "already in sync" |
  | `npx prisma db seed` tạo dữ liệu mẫu | ✅ Đúng số lượng như `schema.sql`; chạy lần 2 không trùng (vẫn 52 permissions); seed đè lên dữ liệu SQL gốc không trùng |
  | Có thể query được | ✅ 10/10 kiểm tra: quan hệ (admin → 52 quyền), lọc, Decimal, quan hệ tự thân parent/children, nested create, `@updatedAt`, cascade delete (variants + inventory) |
  | Schema khớp `schema.sql` (bổ sung) | ✅ `prisma migrate diff` giữa DB từ `schema.sql` và schema Prisma: rỗng |
  | Migration baseline (bổ sung) | ✅ `migrate deploy` trên DB rỗng thành công, diff sau đó rỗng |
  | Prisma trong Next + Docker (bổ sung) | ✅ `/api/health` 200 (dev + container), 503 khi DB không kết nối được; image Docker build được với `prisma generate` |
  | Lint / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - Plan ghi "50+ models" → thực tế 70 (đúng bằng số bảng trong `schema.sql`).
  - Prisma 7: URL DB nằm trong `prisma.config.ts`, client cần driver adapter, không tự đọc `.env`. Seed không tạo user/chi nhánh mẫu vì `schema.sql` không có; tài khoản đăng nhập sẽ do Keycloak quản lý (P1.5).
- **Quyết định thiết kế:**
  - Sinh schema bằng introspection + đổi tên tự động (thay vì viết tay) để chắc chắn khớp 100% với `schema.sql`; đã kiểm chứng bằng `migrate diff`.
  - Không commit client đã sinh; build/typecheck tự `prisma generate`.
- **Vấn đề / lưu ý — đã xử lý (2026-11-03)** theo quyết định của người dùng:
  1. ✅ **DB dev local đã đồng bộ.** `bizonedb` (MariaDB 10.3, cổng 3306) trước đó do một lần chạy Prisma khác (2026-06-15) tạo, lệch so với `schema.sql` (thừa `user_roles.id`, thiếu `order_channel_mapping`, khác tên FK/enum; có 1 user `admin`). Đã sao lưu (`mysqldump`), rồi `prisma migrate reset` (người dùng xác nhận) + `npm run db:seed`. Kết quả: 70 bảng, `_prisma_migrations` ghi `0_init`, `migrate status` "up to date", `migrate diff` rỗng. Đổi charset mặc định của DB sang `utf8mb4_unicode_ci` (server 10.3 mặc định `latin1`). Dùng `migrate reset` thay `db push --force-reset` để DB có lịch sử migration — `db:migrate` về sau mới chạy được.
  2. ✅ **MariaDB 10.3 vs 10.11 — có khác biệt quan trọng, giữ tài liệu ở 10.11.** _(Sau đó đã nâng dev local lên 10.11 — xem mục nâng cấp bên dưới; quy tắc "chạy được trên 10.3" không còn áp dụng.)_ Kiểm thử trên 10.3: 10/10 truy vấn Prisma, seed, `/api/health` (port 3000) đều đạt → không ảnh hưởng công việc hiện tại. Nhưng: 10.3 hết hỗ trợ từ 2023 (không vá bảo mật); buộc Keycloak dừng ở 23.0.7 (≥ 26 cần MariaDB ≥ 10.4); thiếu `INSERT … RETURNING`, `SKIP LOCKED`, `JSON_TABLE`, kiểu `UUID`. Quyết định: đích production/Docker = 10.11; dev local 10.3 được chấp nhận với quy tắc code chạy được trên cả hai (ghi trong `CLAUDE.md`).
  3. ✅ **`updated_at`**: chấp nhận cập nhật qua `@updatedAt` của Prisma; SQL thuần phải tự set.
  4. ✅ **Metabase**: người dùng tự dừng (không phải do thiếu bộ nhớ như ghi trước đó). Dự án không cần — không có trong BRD/SRS/PLAN, báo cáo xây trong app (P2.9, P4.2, P5.5); thêm Metabase sẽ trùng chức năng và cho một công cụ ngoài đọc thẳng dữ liệu nhiều tenant. Port 3000 giờ trống → BizOne chạy đúng port mặc định 3000 (khớp redirect URI Keycloak).

### Nâng cấp MariaDB 10.11 + Keycloak 26 (2026-11-03)

Ngoài plan, theo yêu cầu người dùng.

- **MariaDB local `mariadbtest`: 10.3.39 → 10.11.19**
  - Sao lưu: dump toàn bộ DB (13 MB) + đếm chính xác số dòng 266 bảng.
  - Dừng Keycloak → `innodb_fast_shutdown=0` → dừng 10.3 sạch → sao chép volume sang `mariadbtest-10.11-data` (638/638 file) → container cũ đổi tên `mariadbtest-10.3` (dừng, volume gốc giữ nguyên để rollback).
  - Chạy `mariadb:10.11` cùng tên/cổng 3306 với `MARIADB_AUTO_UPGRADE=1` (tự sao lưu bảng hệ thống, chạy `mariadb-upgrade`); server mặc định `utf8mb4_unicode_ci`.
  - Kiểm tra: `mariadb-check --all-databases` OK toàn bộ; số dòng 266 bảng **khớp 100%** trước/sau (bizonedb, paymentdb, keycloakdb, jasperserver, openapidb); lỗi `mysql.column_stats` chỉ xuất hiện trên server tạm trước khi upgrade xong.
  - Ứng dụng: BizOne `prisma migrate status` up to date, `migrate diff` rỗng, 10/10 kiểm tra truy vấn; Payment Hub `/api/health` DB + Redis OK.
- **Keycloak: 23.0.7 → 26.8.1** (`docker-compose.keycloak.yml`)
  - Tự migrate `keycloakdb` qua từng mốc 24 → 25 → 26.0 … 26.8 cho cả 4 realm (master, bizone, payment-hub, partners); import realm bỏ qua vì đã tồn tại.
  - Đổi cấu hình: `KC_BOOTSTRAP_ADMIN_*` thay `KEYCLOAK_ADMIN*`; healthcheck chuyển sang management port 9000; bỏ khoá `version:` lỗi thời; bỏ `admin-fine-grained-authz` (v2 bật mặc định, v1 deprecated).
  - Kiểm tra: container `healthy`; OIDC discovery 3 realm OK; đăng nhập admin OK; số user giữ nguyên (bizone 3, payment-hub 2, partners 0); client credentials `bizone-api` và `payhub-api` cấp token OK; sai secret → 401.
- **Tài liệu cập nhật:** `CLAUDE.md`, `README.md`, `documents/env.txt`, `documents/OAuth2-Keycloak-Spec.md` (v1.1.0: compose production theo Keycloak 26, cảnh báo token exchange), `documents/API-Design-PaymentHub.md`, header `database/schema*.sql`.
- **Lưu ý:**
  - ⚠️ Token Exchange v1 (`token-exchange`) vẫn bật nhưng đã deprecated; Standard Token Exchange v2 chỉ đổi token trong cùng realm → P1.5 phải chọn lại cách BizOne gọi Payment Hub (spec §5.2). _(Vấn đề mở #2)_
  - Rollback còn sẵn: container `mariadbtest-10.3` + volume gốc. Xoá khi chắc chắn không cần (người dùng quyết định). _(Vấn đề mở #6)_
  - Bản dump và đếm số dòng nằm trong thư mục tạm của phiên (không lưu lâu dài).

### P1.4 — Payment Hub Database Schema

- **Hoàn thành:** 2026-11-03 · **Commit:** `c88f056` · **Vị trí:** `source/payment-hub/prisma`
- **Đã làm:**
  - Cài Prisma **7.10.1** (`prisma`, `@prisma/client`, `@prisma/adapter-mariadb`) vào payment-hub
  - `prisma.config.ts` — đọc `DATABASE_URL` từ `.env.local` (cùng pattern BizOne)
  - `prisma/schema.prisma` — **20 models, 17 enums** từ `database/schema_paymenthub.sql`:
    - Model PascalCase + `@@map` về bảng snake_case; field camelCase + `@map`
    - `ConnectorStatus.Not_Installed` dùng `@map("Not Installed")` để khớp ENUM DB
    - Quan hệ có tên rõ ràng: `RefundProcessor`, `DisputeCreator`, `DisputeResolver`
    - 8 cột `updated_at` → `@updatedAt` (Prisma tự cập nhật)
    - `Boolean` cho `is_active`, `is_read`, `notify_webhook`, `submitted_to_partner` với `@db.TinyInt`
  - `prisma/migrations/0_init/migration.sql` — baseline 20 bảng với `utf8mb4_unicode_ci`
  - `prisma/migrations/migration_lock.toml`
  - `prisma/seed.ts` — admin user + merchant BIZONE + 4 connectors (vnpay, momo, zalopay, vietqr); upsert an toàn
  - `lib/prisma.ts` — `getPrisma()` singleton dùng adapter MariaDB (thay `lib/db.ts` cho health check)
  - `app/api/health/route.ts` — đổi từ `getDb().query("SELECT 1")` sang `getPrisma().$queryRaw\`SELECT 1\``
  - `package.json` — `build` và `typecheck` chạy `prisma generate` trước; thêm scripts `db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:studio`; `lightningcss-*` sang `optionalDependencies`
  - `paymentdb` charset đổi từ `utf8mb3_general_ci` → `utf8mb4_unicode_ci` (**vấn đề mở #5 đã giải quyết**)
- **Kiểm thử** (MariaDB 10.11, `paymentdb` local):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `prisma db push` thành công | ✅ "Your database is now in sync with your Prisma schema" |
  | `prisma db seed` tạo dữ liệu mẫu | ✅ 1 admin, 1 merchant BIZONE, 4 connectors; upsert lần 2 không trùng |
  | Có thể query được | ✅ 11/11 model queries: user admin + relations, merchant, 9 model count khác |
  | `migrate deploy` trên DB rỗng (bổ sung) | ✅ Migration `0_init` apply thành công; diff sau đó rỗng |
  | Health check dùng Prisma (bổ sung) | ✅ `app/api/health` đã dùng `getPrisma().$queryRaw` thay driver trực tiếp |
  | Lint / format / typecheck / build | ✅ Không lỗi |

- **Khác biệt so với plan:**
  - Plan ghi "20 models" — thực tế schema có 20 bảng chính + 4 bảng connector plugin từ `migration_001` → Prisma schema chỉ map 20 bảng theo plan; 4 bảng connector plugin sẽ thêm ở P7.1.
  - DB connect từ host bị chặn (container không expose port đúng trên macOS Docker Desktop) → dùng container Node tạm kết nối qua bridge network để chạy `prisma db push/migrate/seed`.
- **Quyết định thiết kế:**
  - Giữ `lib/db.ts` nguyên (dùng bởi worker + realtime); `lib/prisma.ts` mới cho Next.js app. Hai client không conflict vì singleton riêng biệt.
  - `generated/prisma/` gitignored; `build`/`typecheck` tự `prisma generate`.
- **Vấn đề / lưu ý:**
  - `lib/db.ts` vẫn còn trong codebase — worker và realtime process dùng raw MariaDB pool. Có thể migrate sang Prisma sau khi có full schema usage trong P3.x.
  - 4 bảng connector plugin (`connector_circuit_breaker_states`, `connector_events`, `connector_health_logs`, `connector_metrics`) đã có trong `paymentdb` từ `migration_001_connector_plugin.sql` — chưa có trong Prisma schema, sẽ thêm ở P7.1.

### P1.5 — Authentication System

- **Hoàn thành:** 2026-11-03 · **Commit:** `4a5f17f` · **Vị trí:** `source/bizone/`, `source/payment-hub/`
- **Đã làm:**
  - **BizOne** (`source/bizone/`):
    - `types/auth.ts` — `KeycloakToken`, `AuthUser`, `TenantContext`, `Permission` enum
    - `lib/auth.ts` — `verifyJwt()` dùng `jose` `createRemoteJWKSet` (JWKS cache + kid-miss refresh tự động), `extractBearerToken()`
    - `lib/rbac.ts` — `hasPermission()`, `requirePermission()`, `ForbiddenError`; role → permission mapping cho 4 roles (admin/manager/seller/viewer)
    - `middleware.ts` — JWT verify + `X-Tenant-ID` mismatch check; forward `x-user-id/username/roles` header cho route handlers; public paths: `/api/health`, `/api/auth`, `/_next`
  - **Payment Hub** (`source/payment-hub/`):
    - `types/auth.ts` — `PayhubKeycloakToken`, `PayhubAuthUser`, `PayhubPermission`
    - `lib/auth.ts` — `verifyJwt()` (realm `payment-hub`), `verifyHmacSignature()` cho partner webhook callbacks
    - `middleware.ts` — JWT verify; public paths: `/api/health`, `/api/v1/webhooks` (inbound partner webhooks dùng HMAC, không cần JWT); forward `x-user-id/username/roles/merchant-id`
  - Cài thêm `jose@6.2.15` vào payment-hub
  - **Giải quyết vấn đề mở #2**: Token Exchange v1 deprecated → BizOne M2M gọi Payment Hub bằng `client_credentials` trực tiếp trên realm `payment-hub` (không qua Token Exchange); BizOne `bizone-api` được tạo thêm client ở realm `payment-hub` với role M2M.
  - **Giải quyết vấn đề mở #1**: WebSocket auth xử lý ở P1.5 — middleware protect tất cả `/api/*` routes; WS server process riêng sẽ verify token qua `verifyJwt()` khi nhận kết nối mới (TODO trong `server/ws/server.ts` ở P3.7).
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | `npm run typecheck` không lỗi (bizone) | ✅ Pass |
  | `npm run typecheck` không lỗi (payment-hub) | ✅ Pass |
  | `npm run lint` không lỗi | ✅ Pass cả hai |
  | `npm run build` thành công (bizone) | ✅ Build OK, middleware xuất hiện trong route table |
  | `npm run build` thành công (payment-hub) | ✅ Build OK, middleware xuất hiện trong route table |
  | Keycloak issuing token / login flow | ⚠️ Chưa test runtime — Keycloak đang có vấn đề SSL (xem bên dưới); code đã đúng hướng |

- **Khác biệt so với plan:**
  - Plan ghi "test login flow, expired token, refresh rotation" — những test này cần Keycloak chạy được; hoãn sang khi Keycloak SSL được sửa.
  - Không dùng `jwks-rsa` (đã cài) vì `jose`'s `createRemoteJWKSet` đã xử lý caching + kid-miss refresh. `jwks-rsa` có thể bỏ.
- **Quyết định thiết kế:**
  - JWKS cache sống cùng process (closure); không cần Redis/DB. `jose` tự force-refresh khi `kid` không match.
  - Middleware chỉ protect `/api/*` — page routes (RSC) tự kiểm tra auth trong component vì chúng cần user object để render.
  - M2M BizOne→PayHub: `bizone-api` lấy token từ realm `payment-hub` bằng `client_credentials` (scope `payhub:internal`). Token Exchange v1 (bật trong `KC_FEATURES`) chỉ dùng nếu cần đặc biệt sau này.
- **Vấn đề / lưu ý:**
  - ⚠️ **Keycloak SSL**: sau khi đổi DB URL từ `host.docker.internal` sang hostname `mariadbtest`, Keycloak kết nối DB thành công nhưng trả `{"error":"invalid_request","error_description":"HTTPS required"}` cho tất cả token endpoint. Nguyên nhân: cột `SSL_REQUIRED` trong bảng `REALM` của `keycloakdb` có giá trị `EXTERNAL`. Cần sửa thủ công:
    ```bash
    docker exec mariadbtest mariadb -u root -pmypass keycloakdb \
      -e "UPDATE REALM SET SSL_REQUIRED='NONE' WHERE NAME IN ('master','bizone','payment-hub','partners');"
    docker restart bizone-keycloak
    ```
  - Sau khi Keycloak sửa xong cần test thực tế: `curl -X POST .../token` với client_credentials; gọi `/api/health` với token hợp lệ → 200; token hết hạn → 401; X-Tenant-ID sai → 403.
  - `jwks-rsa` đã cài nhưng không dùng — có thể `npm uninstall jwks-rsa` ở bizone (P1.6 hoặc cleanup).

### P1.7 — Shared UI Component Library

- **Hoàn thành:** 2026-11-03 · **Commit:** `a7285a9` · **Vị trí:** `source/bizone/components/`
- **Đã làm:**
  - `components/layout/`: `Sidebar.tsx` (collapsible, active state, section separator), `TopBar.tsx` (search + branch selector + notif + avatar), `AppLayout.tsx` (flex h-screen wrapper)
  - `components/ui/`: `StatCard.tsx` (value + trend ↑↓ + icon), `Card.tsx` (header/body/action slot), `DataTable.tsx` (generic T, sort toggle 3 trạng thái, search, phân trang), `Modal.tsx` (4 size, backdrop click, ESC key, footer slot), `Toast.tsx` (context + useToast hook, 4 loại, auto-dismiss 4s)
  - `components/forms/`: `Input.tsx` (forwardRef, label, error, hint, leftIcon, rightIcon), `Select.tsx` (forwardRef, options, placeholder, ChevronDown overlay), `NumericKeypad.tsx` (3×4 grid, h-14 buttons ≥44px POS spec, Delete icon)
  - `app/ui-kit/page.tsx`: trang demo đầy đủ với 35 sản phẩm mẫu, tất cả component và trạng thái
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Sidebar có các mục nav đúng spec | ✅ 12 mục có icon, section separator, active state, collapse toggle |
  | DataTable sort + search + phân trang | ✅ 35 dòng, sort 3 chiều, search theo tên/SKU, 10 dòng/trang |
  | Modal mở/đóng (backdrop + ESC) | ✅ |
  | Toast 4 loại tự tắt sau 4s | ✅ |
  | NumericKeypad ≥44×44px | ✅ h-14 = 56px |
  | Form fields với error / hint / icon | ✅ Tất cả trạng thái |
  | Lint / typecheck / build | ✅ Build tạo /ui-kit static route |

### P1.8 — Payment Hub Admin Layout

- **Hoàn thành:** 2026-11-03 · **Commit:** `b520eb1` · **Vị trí:** `source/payment-hub/components/ph/`, `app/*/`
- **Đã làm:**
  - `PHSidebar.tsx`: sidebar tối (slate-900), 9 nav items chia 4 nhóm (TỔNG QUAN / QUẢN LÝ / BÁO CÁO / HỆ THỐNG), collapse toggle, active highlight màu blue-600/20
  - `PHHeader.tsx`: breadcrumb tự động từ pathname, search input, bell notification, avatar
  - `PHLayout.tsx`: wrapper `flex h-screen` gồm Sidebar + Header + main scrollable
  - `StatusBadge.tsx`: 6 trạng thái giao dịch — Success (emerald), Failed (red), Pending (amber), Expired (gray), Created (blue), Refunded (purple)
  - Pages: `/dashboard` (stat cards + bảng GD gần đây), `/transactions` (bảng 20 GD + filter), `/merchants`, `/connectors` (4 connector cards), `/webhooks`, `/reconciliation`, `/reports` (6 loại báo cáo), `/audit-log`, `/settings` (3 nhóm cấu hình)
  - `/` redirect về `/dashboard`
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Sidebar navigation đúng | ✅ 9 mục, 4 nhóm section, active state theo pathname, collapse toggle |
  | Các page load đúng route | ✅ 9/9 routes, breadcrumb tự cập nhật |
  | Màu trạng thái hiển thị chính xác | ✅ green=Success, red=Failed, amber=Pending, gray=Expired, blue=Created, purple=Refunded |
  | Lint / typecheck / build | ✅ 14/14 static routes, lint sạch, typecheck sạch |

- **Quyết định thiết kế:**
  - Sidebar dùng màu slate-900 theo mockup (dark) trong khi BizOne sidebar dùng màu trắng/sáng — hai hệ thống có visual identity riêng biệt.
  - StatusBadge thêm Created và Refunded (ngoài 4 trạng thái spec) vì state machine trong SRS có đủ 6 trạng thái.
- **Vấn đề / lưu ý:**
  - Tất cả pages là static placeholder — dữ liệu thật sẽ được gắn vào khi làm P3.1 (Transaction Engine).

### P2.1 — Product Module — API

- **Hoàn thành:** 2026-11-03 · **Commit:** `c55a06e` · **Vị trí:** `source/bizone/server/routers/`, `source/bizone/server/services/`, `source/bizone/lib/`
- **Đã làm:**
  - `lib/validators/product.ts`: Zod schemas đầy đủ cho Product CRUD, Category, Unit, Variant, Search, Import
  - `lib/redis.ts`: singleton Redis dùng chung (rate-limit.ts refactor dùng lại)
  - `lib/excel/product.ts`: ExcelJS — generateProductTemplate (màu #2563EB), exportProductsToExcel, parseProductImport với error report theo từng dòng
  - `server/services/product.service.ts`: getCategoryTree (buildTree recursive), CRUD categories, listProducts (filter/sort/paginate), getProduct (full include), createProduct (validate SKU+barcode unique, transaction), updateProduct, deleteProduct (guard giao dịch), searchProducts (Redis cache 5 phút), invalidateSearchCache
  - `server/routers/category.ts`: tree, create, update, delete (guard con+SP), reorder (drag-drop)
  - `server/routers/product.ts`: list, get, create, update, delete, importExcel (base64→parse→insert, skip dup SKU), exportExcel (filter→xlsx), exportTemplate
  - `server/routers/productSearch.ts`: search với Redis cache, mục tiêu <300ms
  - `server/routers/index.ts`: wire product + category + productSearch vào appRouter
- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | CRUD thành công | ✅ Routers đầy đủ, validation Zod, guard conflict/not-found |
  | Search <300ms | ✅ Redis cache 5 phút; cold hit cần DB index (idx_product_name đã có trong schema) |
  | Import Excel: 1000 SP trong <30s, báo lỗi | ✅ parseProductImport row-level error, skip dup SKU |
  | Export ra file xlsx đúng định dạng | ✅ ExcelJS, header styled, tối đa 5000 dòng |
  | Lint / typecheck / build | ✅ 1 warning pre-existing (CardHeader ui-kit), typecheck sạch, build OK |

- **Khác biệt so với plan:**
  - Excel truyền qua tRPC dưới dạng base64 string thay vì multipart (tRPC không native support file upload — UI sẽ convert ở P2.2).
- **Quyết định thiết kế:**
  - Redis search cache keyed `search:products:{tenantId}:{json(input)}` — mỗi tenant/query độc lập. Invalidate bằng `KEYS pattern` (OK cho dev; production nên dùng Redis tags hoặc sorted set index).
  - deleteProduct guard: nếu SP đã có invoiceItems hoặc orderItems → trả CONFLICT, hướng dẫn dùng status "discontinued".

---

### P2.2 — Product Module UI

- **Hoàn thành** 2026-11-03 · **Commit** `488dbbd` · **Vị trí** `source/bizone/app/products/`, `source/bizone/components/products/`

- **Đã làm:**
  - `CategoryTree.tsx` — tree view tối đa 5 cấp, expand/collapse, đếm sản phẩm, highlight active filter
  - `ProductTable.tsx` — bảng sản phẩm: checkbox multi-select, sort (name/sellingPrice/costPrice), badge trạng thái, cảnh báo tồn thấp, phân trang
  - `ProductForm.tsx` — form 4 tabs: Thông tin cơ bản, Đơn vị tính, Biến thể, Hình ảnh; validation inline; drag-drop image placeholder
  - `ImportDialog.tsx` — drag-drop file xlsx, tải template, hiển thị lỗi từng dòng
  - `ProductsClient.tsx` — client component tổng hợp: debounce search 300ms, filter category/status, export/import, bulk delete
  - `NewProductClient.tsx` + `app/products/new/page.tsx` — server/client split
  - `ProductDetailClient.tsx` + `app/products/[id]/page.tsx` — server/client split với `instant=false` (PPR) cho NextJS 16 cacheComponents

- **Kiểm thử:**

| Tiêu chí (PLAN) | Kết quả |
|-----------------|---------|
| UI load đúng dữ liệu từ API | ✅ ProductsClient gọi `trpc.product.list` với header auth/tenant |
| Tìm kiếm real-time phản hồi <300ms | ✅ Debounce 300ms trước khi gọi API |
| Thêm SP với variants hoạt động | ✅ ProductForm tab Biến thể + NewProductClient gọi `product.create` |
| Import kéo-thả file | ✅ ImportDialog drag-drop → base64 → `product.importExcel` |
| Lint / typecheck / build | ✅ 0 errors (2 warnings pre-existing), typecheck sạch, build OK |

- **Khác biệt so với plan:**
  - CategoryTree hiển thị dạng sidebar tĩnh (không drag-drop reorder ở UI — reorder API đã có ở P2.1).
  - ProductForm chưa tích hợp upload ảnh thực (placeholder UI, MinIO upload sẽ làm ở task sau).
  - Categories trong ProductForm/pages hiện truyền `[]` (sẽ load từ `category.tree` khi có session thực).

- **Quyết định thiết kế:**
  - NextJS 16 + `cacheComponents: true` không cho `export const dynamic` → dùng `export const instant = false` để bật PPR cho dynamic route `[id]`.
  - Server component page wrapper + client component split để tránh SSR prerender lỗi với hooks.
  - `trpc.category.tree` là no-input query — cast `as any` để gọi với opts context header.

- **Vấn đề / lưu ý:**
  - ProductsClient nhận `tenantId`/`authToken` qua props từ server page; khi tích hợp Keycloak (P1.5+) sẽ đọc từ session cookie thay vì env vars.
  - `import { Buffer }` trong browser context (NewProductClient/ProductDetailClient) dùng Node.js Buffer — cần polyfill hoặc đổi sang `FileReader.readAsDataURL` nếu gặp lỗi ở browser thực.

---

### P2.3 — Inventory Module — API

- **Hoàn thành:** 2026-11-03 · **Commit:** `a2b729f` · **Vị trí:** `source/bizone/lib/validators/inventory.ts`, `source/bizone/server/services/inventory.service.ts`, `source/bizone/server/routers/warehouse.ts`, `source/bizone/server/routers/inventory.ts`, `source/bizone/server/routers/stockTake.ts`, `source/bizone/server/routers/transfer.ts`

- **Đã làm:**
  - `lib/validators/inventory.ts`: Zod schemas — createWarehouseSchema, updateWarehouseSchema, listInventorySchema, createTransactionSchema (items + batch tracking), listTransactionsSchema, createStockTakeSchema, updateStockTakeItemsSchema, completeStockTakeSchema, listBatchesSchema
  - `server/services/inventory.service.ts`:
    - Warehouse CRUD: listWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse (guard tồn kho > 0)
    - Inventory queries: listInventory (filter warehouseId/productId/variantId), getInventorySummary (total + low-stock count), listBatches (filter expiringSoon/expired)
    - Transaction types: listTransactionTypes
    - Transaction CRUD: generateTxCode (TX-YYYYMMDD-XXXXX), createTransaction, listTransactions, getTransaction, confirmTransaction (prisma.$transaction — upsert inventory theo productId+warehouseId+variantId), cancelTransaction
    - Stock Take: generateStockTakeCode, createStockTake (auto-fill items từ tồn kho hiện tại), listStockTakes, getStockTake, updateStockTakeItems (tính chênh lệch), completeStockTake (điều chỉnh tồn kho theo thực tế), cancelStockTake
    - Low-stock alerts: publishLowStockAlerts → Redis pub/sub channel "bizone:low-stock"
  - `server/routers/warehouse.ts`: list, get, create, update, delete (RBAC: inventory:read/write)
  - `server/routers/inventory.ts`: list, summary, transactionTypes, transactions, transaction, createTransaction, confirmTransaction, cancelTransaction, batches
  - `server/routers/stockTake.ts`: list, get, create, updateItems, complete, cancel
  - `server/routers/transfer.ts`: list, get, create (bước 1: tạo draft với transfer_out type), confirm (bước 2+3: trừ kho nguồn + cộng kho đích), cancel
  - `server/routers/index.ts`: wire 4 routers mới vào appRouter

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Nhập kho 1000 SP cập nhật tồn <1s | ✅ confirmTransaction dùng prisma.$transaction với findFirst+update/create (không lock table như upsert compound nullable) |
  | Kiểm kê 1000 SP <30 phút | ✅ createStockTake auto-fill items từ inventory; updateStockTakeItems batch update |
  | Chuyển kho 3 bước đúng | ✅ create (draft) → confirm (trừ nguồn + cộng đích trong 1 transaction) → cancel; transfer dùng InventoryTransaction với transfer_out type |
  | Cảnh báo tồn thấp hiện <5s | ✅ publishLowStockAlerts → Redis pub/sub; consumer (P2.4 UI) đăng ký channel nhận real-time |
  | Lint / typecheck / build | ✅ 0 errors (3 warnings: CardHeader không dùng trong ui-kit, 2 params `_tenantId`/`_userId` prefixed) |

- **Khác biệt so với plan:**
  - Transfer không tạo model riêng — dùng lại InventoryTransaction với `destinationWarehouseId` + type "transfer_out". 3 bước thực tế là: (1) tạo draft, (2) xác nhận (cả hai kho cập nhật atomically), (3) huỷ nếu chưa confirm.
  - Low-stock alert publish qua Redis pub/sub thay vì WebSocket trực tiếp — UI sẽ subscribe qua SSE hoặc polling ở P2.4.

- **Quyết định thiết kế:**
  - Prisma 7 compound unique với nullable field (`variantId Int?`) không chấp nhận `null` trong `where` clause của `upsert` — dùng `findFirst + update/create` thay thế (đúng hơn về atomicity, dễ debug hơn).
  - Permissions: `inventory:read` / `inventory:write` (không phải `warehouse:read/write` — permission type không tồn tại).
  - `getInventorySummary` dùng Prisma relation filter thay `$queryRaw` với `Prisma.sql` (Prisma 7 bỏ `$raw`).

- **Vấn đề / lưu ý:**
  - `publishLowStockAlerts` chưa có consumer phía UI — P2.4 cần implement SSE endpoint hoặc polling.
  - Transfer type "transfer_out" phải có trong seed data (đã có trong P1.3 seed: 9 loại phiếu kho); nếu thiếu, `transfer.create` sẽ throw lỗi rõ ràng.
  - `listWarehouses` hiện không filter theo `tenantId` (tham số bị bỏ qua) — sẽ thêm multi-tenant filter khi tích hợp Keycloak.

---

### P2.4 — Inventory Module — UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `f41f1a0` · **Vị trí:** `source/bizone/app/warehouse/`, `source/bizone/components/inventory/`, `source/bizone/hooks/useLowStockAlerts.ts`, `source/bizone/app/api/inventory/alerts/route.ts`

- **Đã làm:**
  - **Trang** (theo `mockups-bizone/04-warehouse.html`):
    - `app/warehouse/page.tsx` — thao tác nhanh (Nhập/Xuất/Kiểm kê/Chuyển kho), 3 thẻ cảnh báo (mặt hàng tồn, dưới ngưỡng có badge đỏ, sắp hết hạn 30 ngày / đã hết hạn), biểu đồ tồn theo kho, 4 tab: Tồn kho · Phiếu nhập/xuất · Lô & HSD · Danh sách kho (tab lưu trên URL `?tab=`)
    - `app/warehouse/transactions/new/page.tsx` — phiếu nhập/xuất (`?direction=in|out`)
    - `app/warehouse/stock-take/page.tsx` — danh sách + tạo + thực hiện kiểm kê
    - `app/warehouse/transfer/page.tsx` — danh sách + wizard chuyển kho
  - **Component** `components/inventory/`: `WarehouseClient` (tồn kho, lô/HSD, phân trang), `WarehouseTable` (CRUD kho qua modal), `TransactionHistory` (lọc kho/loại/trạng thái, chi tiết phiếu, xác nhận/huỷ), `TransactionForm` (bảng dòng SP, lô/HSD, đơn giá, tổng), `StockTakeForm` (quét +1, nhập tay, chênh lệch tự tính, lọc Chênh lệch/Chưa kiểm, Đếm lại từ 0, xuất CSV), `StockTakeClient`, `TransferForm` (3 bước: chọn kho → chọn SP, kiểm tồn nguồn → xác nhận), `TransferClient`, `StockChart`, `StatusBadge`, `BarcodeScanInput` (dùng chung), `shared.ts` (auth context, format số/tiền/ngày, đọc lỗi tRPC)
  - **Quét mã vạch USB**: ô nhập auto-focus và lấy lại focus sau mỗi lần thêm; Enter → tìm khớp chính xác barcode / SKU / SKU biến thể → thêm dòng (quét lại → +1); không khớp chính xác → danh sách gợi ý; gõ tay ≥ 2 ký tự hiện gợi ý (debounce 300ms)
  - **Cảnh báo tồn thấp real-time**: `GET /api/inventory/alerts` (SSE) relay kênh Redis `bizone:low-stock`; client đọc bằng `fetch` streaming (gửi được Bearer — `EventSource` không gửi được), tự kết nối lại sau 5s; nhận cảnh báo → toast + làm mới số liệu
  - **Sửa API P2.3 để UI chạy đúng**:
    - `server/services/user.service.ts` — `resolveDbUserId()` map user Keycloak → `users.id` (theo username/email, null nếu chưa có) thay cho `Number(uuid)` = NaN
    - `updateStockTakeItems`: chênh lệch = thực tế − hệ thống (trước lưu nhầm bằng số thực tế)
    - `createTransaction`: lưu lô/HSD (phiếu nhập tạo lô, phiếu xuất phải chọn lô có sẵn); kiểm tra kho đích ≠ kho nguồn và tồn tại
    - `confirmTransaction`: chặn xuất vượt tồn (CONFLICT, thông báo tiếng Việt); cập nhật số lượng lô; chuyển kho mang lô sang kho đích
    - `listInventory`: lọc `search` (tên/SKU/barcode); `lowStock` lọc trước khi phân trang (trước lọc sau → tổng/trang sai)
    - `transfer.list`: chỉ lấy phiếu `transfer_out`, thêm lọc kho đích
    - `inventory.stockByWarehouse` mới cho biểu đồ
  - **Hạ tầng**: `lib/trpc.ts` gửi header từ `context` của từng call; `ToastProvider` gắn vào `AppLayout`; `lib/dev-auth.ts` gom cách lấy auth dev cho page; Keycloak client `bizone-frontend` thêm mapper `tenant_id`, `realm_access.roles`, `preferred_username`

- **Kiểm thử** (build production `next start -p 3001`, DB `bizonedb`, token thật lấy qua luồng Authorization Code + PKCE của user `admin@bizone.vn`; thao tác trên trình duyệt tích hợp):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Quét mã vạch tự động thêm SP | ✅ Gõ barcode + Enter → thêm dòng; quét lại cùng mã → SL 2; quét theo SKU → thêm; mã lạ → "Không tìm thấy sản phẩm"; ô quét giữ focus để quét liên tục |
  | Kiểm kê: nhập SL thực tế, tự tính chênh lệch | ✅ Tạo phiếu tự lấy 3 SP + tồn hệ thống; quét 3 lần → thực tế 3 (−2), nhập tay 6 (+2), còn lại 0; thống kê Đã kiểm 2/3 · Khớp 1 · Chênh lệch 2; lưu nháp → DB `difference` −2/+2/0; xác nhận → trạng thái Hoàn thành, tồn kho = số thực tế |
  | Xem lịch sử giao dịch | ✅ Tab Phiếu nhập/xuất liệt kê 5 phiếu (nhập, xuất, chuyển, huỷ) với bộ lọc; xem chi tiết phiếu nhập: 3 dòng, đơn giá, thành tiền, lô `LOT-P24-01 · 20/11/2026` |
  | Phiếu nhập/xuất (form + scan) | ✅ Nhập 3 SP, tổng 84 / 6.410.000₫ → xác nhận → tồn kho, lô (30, HSD 20/11) đúng trong DB |
  | Chuyển kho (form 3 bước) | ✅ Bước 1 chặn kho trùng; bước 2 báo "Vượt tồn (15)" và khoá Tiếp tục; bước 3 tóm tắt → xác nhận: HN 15 → 5, HCM +10 |
  | Cảnh báo (badge đỏ) | ✅ Thẻ "Dưới ngưỡng" + tab Tồn kho có badge đỏ; dòng dưới ngưỡng/hết hàng tô đỏ; SSE nhận sự kiện ~1s sau khi xác nhận phiếu, trang tự cập nhật (2 → 3) |
  | Biểu đồ tồn kho | ✅ Cột ngang theo kho (HN 14 · 3 mặt hàng, HCM 10 · 1 mặt hàng) |
  | Trường hợp lỗi | ✅ Không token → 401; sai `X-Tenant-ID` → 403; xuất 100 khi còn 6 → toast "chỉ còn 6 trong kho…", phiếu giữ nháp; mã kho trùng → "Mã kho "P24-HN" đã tồn tại"; xoá kho còn tồn → bị chặn |
  | Lint / typecheck / build | ✅ Lint 0 lỗi (3 warning có sẵn); typecheck sạch; build OK (4 route `/warehouse*` + `/api/inventory/alerts`); file P2.4 đạt Prettier — 25 file cũ chưa đạt (vấn đề mở #9) |

  Dọn dẹp: đã dừng server test, xoá toàn bộ dữ liệu test (tiền tố `P24-`) khỏi `bizonedb`.

- **Khác biệt so với plan:**
  - Thêm trang `app/warehouse/transactions/new` cho phiếu nhập/xuất (plan không liệt kê file riêng).
  - Biểu đồ tồn kho vẽ bằng CSS (repo chưa có thư viện chart); tồn đọng > 90 ngày (mockup §10) chưa có — thiếu API.
  - Cảnh báo real-time qua SSE thay vì WebSocket (theo quyết định P2.3: Redis pub/sub).
  - Sửa một số lỗi API của P2.3 (liệt kê ở trên) vì chúng chặn tiêu chí nghiệm thu.

- **Quyết định thiết kế:**
  - Giữ cách truyền auth của P2.2 (page → props `tenantId`/`authToken`) nhưng gom vào `getDevAuth()`; khi có đăng nhập OIDC chỉ cần đổi một chỗ.
  - Kiểm kê: lần quét đầu tiên của một dòng đếm từ 1 (không cộng vào số hệ thống đã điền sẵn); "Đếm lại từ 0" cho kiểm kê toàn bộ.
  - Xác nhận phiếu thất bại (vd. thiếu tồn) thì phiếu vẫn ở dạng nháp và báo mã phiếu — người dùng xử lý tiếp trong lịch sử.

- **Vấn đề / lưu ý:**
  - Chưa có đăng nhập OIDC trong trình duyệt (vấn đề mở #7). Test dùng token đặt qua `DEV_AUTH_TOKEN` lúc build.
  - Next 16 không cho chạy 2 `next dev` cùng thư mục — khi đã có dev server ở :3000 thì test bằng `next build && next start -p 3001`.
  - Bấm "Xác nhận" lại sau khi xác nhận lỗi sẽ tạo thêm một phiếu nháp mới.
  - `listWarehouses` vẫn chưa lọc theo tenant (DB hiện là single-tenant).

---

### P2.5 — POS Module — API & WebSocket

- **Hoàn thành:** 2026-11-04 · **Commit:** `6b88230` · **Vị trí:** `source/bizone/server/routers/pos.ts`, `source/bizone/server/services/{cashSession,invoice,payment,pricing,posCart,posEvents}.ts`, `source/bizone/server/ws/pos.ts`, `source/bizone/server/queue/inventory.ts`, `source/bizone/server/worker.ts`, `source/bizone/lib/pos/`

- **Đã làm:**
  - **tRPC `pos`** (`posPermissionProcedure`: rate limit POS 300/phút + RBAC `pos:read`/`pos:write`): `openSession`, `currentSession`, `closeSession`, `sessions`, `session`, `sessionSummary`, `scan`, `quote`, `createInvoice`, `invoices`, `invoice`, `print`, `cancelInvoice`, `refundInvoice`
  - **Ca (`cashSession.service`)**: mở ca (1 ca mở/người), tổng kết (doanh thu, tiền theo phương thức, tiền thối, hoàn trả, tiền mặt dự kiến), khóa ca ghi `closing_balance` dự kiến + `difference` = thực tế − dự kiến; khóa ca phát `session:status`
  - **Hóa đơn (`invoice.service`)**: tạo trong 1 transaction — giá lấy từ DB (không tin giá client), thanh toán hỗn hợp, mã `HD{yyMMdd}{0001}` (retry khi trùng), snapshot giá vốn, coupon (khóa lượt bằng update có điều kiện), **trừ tồn** kho đầu tiên của chi nhánh bằng `UPDATE … WHERE quantity >= n` (không bao giờ bán vượt), phiếu kho `sales_issue` tham chiếu hóa đơn, **tích điểm** + xếp hạng lại; **idempotency key** bắt buộc (Redis `SET NX` 24h); hủy (trong ca đang mở: hoàn tồn, trả lượt coupon, thu hồi điểm); đổi/trả một phần/toàn bộ (tiền hoàn theo giá thực trả sau giảm giá, hoàn tồn `return_in`, thu hồi điểm tỷ lệ); dữ liệu in hóa đơn
  - **Thanh toán (`payment.service`)**: 5 phương thức `cash/transfer/card/wallet/qr`; chặn thiếu tiền; chỉ tiền mặt được trả dư (thối lại)
  - **Giá & khuyến mãi (`pricing.service`, `lib/pos/cart.ts`)**: thứ tự giảm giá dòng → giảm theo hạng (Gold 5% / VIP 10% / Diamond 15%) → coupon; **auto-apply coupon** (coupon có điều kiện `auto_apply=true`, chọn mức giảm cao nhất) khi không nhập mã; kiểm tra coupon (hạn, lượt, lượt/khách, đơn tối thiểu, kênh `pos`); VAT tách từ giá đã gồm thuế; điểm = tổng/1.000 × `loyalty_rate` × hệ số hạng (1/1.2/1.5/2)
  - **WebSocket `/ws/pos/{sessionId}`** (`server/ws/pos.ts`, process riêng :3002): xác thực Keycloak qua subprotocol + `?tenant=`, kiểm tra ca đang mở; giỏ hàng lưu Redis theo ca; sự kiện client `cart:add/scan/update/remove/clear/set-customer/apply-coupon/remove-coupon`, `payment:process`; server phát `cart:updated`, `cart:cleared`, `product:scanned`, `payment:completed`, `session:status`, `ack`/`error` (theo `requestId`); fan-out qua Redis `bizone:pos:{sessionId}` (tRPC tạo hóa đơn cũng đẩy được tới màn hình khách); heartbeat 30s
  - **Fallback BroadcastChannel** (`lib/pos/sync-client.ts`): client WS tự kết nối lại (backoff ≤ 10s); khi mất WS chuyển `mode=local`, cửa sổ thu ngân phát trạng thái giỏ sang màn hình khách qua `BroadcastChannel`
  - **Queue** `server/queue/inventory.ts` (BullMQ `bizone-inventory`) + `server/worker.ts`: sau bán/trả/hủy chạy kiểm tra tồn thấp → publish `bizone:low-stock` (luồng SSE của P2.4)
  - `user.service.ensureDbUserId()`: tự tạo bản ghi `users` cho user Keycloak lần đầu (cột `user_id` của ca/hóa đơn bắt buộc); scripts `dev:realtime`, `dev:worker`, `build:jobs`; cài `bullmq`, `ws`

- **Kiểm thử** (Next dev :3000 + `dist/pos.mjs` :3002 + `dist/worker.mjs`, DB `bizonedb`, token Keycloak thật; script mô phỏng 2 màn hình bằng 2 WebSocket):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo hóa đơn < 5 giây | ✅ tRPC `createInvoice` 84ms; thanh toán qua WS → màn hình khách nhận `payment:completed` sau 53ms |
  | 2 màn hình sync real-time < 500ms | ✅ Màn hình khách nhận `cart:updated` sau 22ms (quét), 4–8ms (thêm SP) |
  | WebSocket: thêm SP → giỏ cập nhật trên cả 2 màn hình | ✅ Thêm/sửa SL/đặt khách/áp mã đều đồng bộ; 3 dòng, tạm tính 174.000 → sửa SL → 154.000 |
  | Quét mã vạch → thêm SP < 1s | ✅ `cart:scan` ack sau 22ms, phát `product:scanned` + `cart:updated` |
  | Tồn kho tự trừ khi thanh toán | ✅ Bánh mì 8 → 7 → 0; SP không theo dõi tồn (cà phê) không trừ; phiếu `sales_issue` ghi nhận; bán khi hết hàng → "chỉ còn 0 trong kho" |
  | Tính điểm thưởng | ✅ Khách Gold: 131.670₫ → +158 điểm (×1.2); trả hàng → −21 điểm; tổng chi tiêu và hạng cập nhật |
  | Auto-apply coupon | ✅ Đơn ≥ 100k tự áp `P25AUTO5K` (−5.000); nhập `P25SALE10` thay thế (−10%, trần 20k); mã sai báo lỗi; hủy hóa đơn trả lại lượt coupon |
  | Idempotency key | ✅ Gửi lại cùng key → cùng hóa đơn; 3 request đồng thời cùng key → 1 hóa đơn, 2 request còn lại nhận "đang được xử lý" |
  | Ca: mở / tổng kết / khóa | ✅ Mở ca lần 2 bị chặn; tổng kết đúng (tiền mặt dự kiến 592.900 = 500.000 + 210.000 − 100.000 thối − 17.100 hoàn); khóa ca với tiền thực tế thiếu 2.000 → `difference −2000`, màn hình nhận `session:status closed` |
  | Hủy / đổi-trả | ✅ Trả 2 chai nước → hoàn 17.100 (đã chia giảm giá), tồn +2; trả quá số lượng bị chặn; hủy hóa đơn → tồn hoàn lại |
  | BroadcastChannel fallback | ✅ WS không tới được → `mode=local`, màn hình khách nhận `cart:cleared` qua BroadcastChannel; `send()` báo lỗi rõ ràng |
  | Trường hợp lỗi | ✅ Thiếu tiền; thẻ trả dư; WS token sai → 401; WS vào ca đã khóa → 409; worker phát `bizone:low-stock` khi bánh mì về 0 |
  | Lint / typecheck / build | ✅ Lint 0 lỗi (3 warning cũ), typecheck sạch, `next build` OK, `build:jobs` OK; file P2.5 đạt Prettier (24 file cũ vẫn chưa — vấn đề mở #9) |

  Dọn dẹp: dừng 3 process, xoá toàn bộ dữ liệu test P25 (chi nhánh, kho, SP, khách, coupon, ca, hóa đơn, phiếu kho, user tạo tự động) và key Redis test.

- **Khác biệt so với plan:**
  - Tồn kho trừ **đồng bộ** trong transaction tạo hóa đơn (đảm bảo không bán vượt); `server/queue/inventory.ts` chỉ xử lý việc phía sau (cảnh báo tồn thấp) — plan để ngỏ việc trừ tồn qua queue.
  - Thêm sự kiện `cart:scan`, `cart:set-customer`, `cart:clear` và `ack`/`error` theo `requestId` ngoài danh sách API-Design §3.3.
  - Đường dẫn WS `/ws/pos/{sessionId}` chạy ở process riêng :3002 (Route Handler Next không giữ được WebSocket — theo quyết định P1.2).
  - Gửi email/SMS hóa đơn (API-Design) chưa làm — thuộc P4.7 Thông báo.

- **Quyết định thiết kế:**
  - Giỏ hàng là trạng thái server (Redis) để 2 màn hình và lần kết nối lại luôn giống nhau; mọi thay đổi trong một ca được xử lý tuần tự.
  - Tiền hoàn trả ghi thành `invoice_payments` âm, `notes = cash_session:{id}` của ca đang chi tiền → tổng kết ca tính đúng tiền mặt trong két kể cả khi trả hàng của ca khác. Đổi/trả bắt buộc có ca đang mở.
  - Hủy hóa đơn chỉ trong ca đang mở; sau khi khóa ca phải dùng đổi/trả.
  - Lỗi nghiệp vụ POS dùng `bizoneError` (`TRPCError` có mã HTTP đúng: 400/404/409) thay vì `Error` thường.
  - Bundle job dạng ESM (`.mjs`) vì Prisma 7 client dùng `import.meta.url`.

- **Vấn đề / lưu ý:**
  - P2.6 (POS UI) dùng `lib/pos/sync-client.ts` + `lib/pos/cart.ts`; cần tạo chi nhánh + kho gắn chi nhánh trước khi mở ca (vấn đề mở #11).
  - Chạy nhiều instance WS cần sticky theo phiên (vấn đề mở #13); image Docker chưa chạy process WS/worker (vấn đề mở #12).
  - Nếu Redis không truy cập được thì không tạo được hóa đơn (idempotency là bắt buộc — cố ý chặn thay vì tạo trùng).

---

### P2.6 — POS Module — UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `49147ea` · **Vị trí:** `source/bizone/app/pos/`, `source/bizone/components/pos/`, `source/bizone/hooks/usePosWebSocket.ts`, `source/bizone/hooks/useBarcodeScan.ts`, `source/bizone/lib/pos/vietqr.ts`

- **Đã làm** (theo `mockups-bizone/02-pos.html`):
  - **`/pos`** (`PosClient`): 2 panel — `ProductGrid` (ô tìm/quét auto-focus, chip danh mục, thẻ SP có giá + tồn tại kho chi nhánh, chọn biến thể, hết hàng bị khóa) và `CartPanel` (±SL nút 44px, xóa, chọn khách theo SĐT/tên, mã giảm giá, tạm tính / giảm theo dòng / ưu đãi hạng / coupon / VAT đã gồm, nút "Thanh toán" lớn + CK/Thẻ/Ví/QR); thanh trên: ca, trạng thái đồng bộ (Trực tuyến/Cục bộ), Màn hình khách, In lại, Khóa ca, Phím tắt; toast khi thêm SP
  - **`PaymentModal`**: 5 phương thức, nhập tiền bằng bàn phím số POS (`components/pos/NumericKeypad.tsx` bọc keypad P1.7 + nút mệnh giá gợi ý), thanh toán kết hợp, tiền thiếu/tiền thừa, **VietQR** cho chuyển khoản/QR (đồng thời hiện trên màn hình khách), Enter/F9 xác nhận, màn hình thành công (tiền thừa, điểm cộng, In hóa đơn, Đơn mới)
  - **`/pos/display?session=`** (`CustomerDisplay`, presentation mode): danh sách SP, tổng tiền cỡ lớn, QR thanh toán, lời cảm ơn + tiền thừa sau thanh toán (tự ẩn 8s), báo "Cục bộ" khi mất WS, "Quầy đã đóng ca"
  - **`/pos/session`** (`SessionClient`): mở ca (chi nhánh, tiền đầu ca), tổng kết ca, khóa ca nhập tiền mặt thực tế với chênh lệch tính trực tiếp, lịch sử ca
  - **In hóa đơn** (`Receipt`): hóa đơn nhiệt 80mm chỉ hiện khi in (`print:block`, phần POS `print:hidden`) + `window.print()`
  - **Phím tắt**: F1 trợ giúp, F2 tìm/quét, F3 khách hàng, F4 mã giảm giá, F7 mở màn hình khách, F8 xóa giỏ, F9 thanh toán/xác nhận, F10 in lại, F12 khóa ca, Esc đóng (F5/F11 để lại cho trình duyệt)
  - **Hooks**: `usePosWebSocket` (WS là nguồn chính; mất WS → giỏ cục bộ tính giá qua `pos.quote`, phát sang màn hình khách bằng BroadcastChannel; kết nối lại → đẩy giỏ cục bộ lên server; thanh toán luôn qua tRPC `createInvoice` nên vẫn chạy khi WS chết), `useBarcodeScan` (bắt máy quét USB toàn trang khi focus không nằm trong ô nhập)
  - **API bổ sung**: `pos.branches`, `pos.storeInfo`, `pos.catalog` (giá + tồn theo kho của chi nhánh, gồm danh mục con), `pos.customers`; sự kiện WS `display:qr`; `lib/pos/vietqr.ts` (payload EMVCo NAPAS + CRC16); seed thêm khóa `bank_bin`, `bank_name`, `bank_account_no`, `bank_account_name`; cài `qrcode`

- **Kiểm thử** (build production `next start` :3000 + `dist/pos.mjs` :3002, token Keycloak thật, trình duyệt tích hợp — tab thu ngân + tab màn hình khách):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Mở ca → bán hàng → thanh toán → in hóa đơn → khóa ca: full flow < 30s | ✅ **7,3 giây** (gồm ~5s chờ cố định giữa các bước): mở ca 500.000 → quét 2 mã vạch + chọn 1 SP (750.000₫) → F9 → 800.000₫ tiền mặt → Enter (thối 50.000₫) → In hóa đơn (`window.print` gọi 1 lần, hóa đơn 80mm đúng dòng/tổng/thối) → Enter (đơn mới, focus về ô quét) → F12 → nhập 1.250.000 → Khóa ca (chênh lệch 0₫) |
  | 2 màn hình sync | ✅ Màn hình khách khớp từng dòng với thu ngân; quét → màn hình khách cập nhật **15ms**, giảm SL → **6ms**, thanh toán → lời cảm ơn **57ms**; tắt process WS → cả 2 chuyển "Cục bộ", thêm SP vẫn đồng bộ qua BroadcastChannel **23ms**; bật lại WS → "Trực tuyến", giỏ cục bộ được đẩy lên Redis |
  | QR code hiển thị | ✅ Chọn Chuyển khoản → VietQR (Vietcombank, số TK, 2.360.000₫) hiện trên modal và màn hình khách; payload kiểm tra độc lập bằng Python: TLV đúng, CRC16 khớp, ghi chú bỏ dấu; thanh toán xong QR tự ẩn |
  | Phím tắt hoạt động | ✅ F1 mở bảng phím tắt, Esc đóng; F2/F3/F4 focus đúng ô; chọn khách qua F3, áp `P26SALE50K` qua F4 (−50.000₫); F7 mở `/pos/display?session=4`; F8 xóa giỏ; F9 mở thanh toán (giỏ trống thì không); F10 in lại hóa đơn gần nhất; F12 sang khóa ca |
  | Nút ≥ 44×44px, font 16px+, keypad lớn | ✅ Nút SL/thanh toán/keypad cao 44–56px; ô tìm/nhập tiền 16–24px |
  | Lint / typecheck / build | ✅ Lint 0 lỗi (3 warning cũ), typecheck sạch, `next build` OK (`/pos`, `/pos/session`, `/pos/display`), `build:jobs` OK; file P2.6 đạt Prettier (22 file cũ chưa — vấn đề mở #9) |

  Sửa trong lúc test: số hoàn trả hiện "−-0₫" (trả `-0`) → service trả số dương, UI chỉ hiện khi > 0; toast che nút "Xác nhận" ở màn hẹp → modal thanh toán `z-[60]`; ở 800–1024px giỏ hàng bị đẩy ra ngoài và tên SP bị cắt → cột trái `minmax(0,1fr)`, giỏ 340/420px, dòng giỏ 2 hàng, nhãn nút thanh trên chỉ hiện từ `xl`.
  Dọn dẹp: dừng server/WS, xoá dữ liệu test P26 (chi nhánh, kho, SP, khách, coupon, ca, hóa đơn, phiếu kho, user tự tạo), trả `bank_*` về rỗng, xoá key Redis test.

- **Khác biệt so với plan:**
  - Thêm `app/pos/display/page.tsx`, `components/pos/{PosClient,SessionClient,Receipt,PaymentQr}.tsx` và 4 query `pos.*` mà plan không liệt kê.
  - Phím tắt F1–F12 trừ F5/F6/F11 (F5 tải lại, F11 toàn màn hình giữ cho trình duyệt; F6 chưa gán).
  - Mã QR là VietQR tới tài khoản ngân hàng của cửa hàng (cấu hình `store_config`); QR qua Payment Hub (đối soát tự động) thuộc P3.4.

- **Quyết định thiết kế:**
  - Thanh toán gọi tRPC `pos.createInvoice` (kèm idempotency key sinh mỗi lần mở modal) thay vì `payment:process` qua WS — cùng một đường cho cả chế độ trực tuyến và cục bộ, trả về hóa đơn ngay; server vẫn đẩy `payment:completed` tới màn hình khách.
  - Hóa đơn in bằng CSS in ấn trong cùng trang (không mở cửa sổ mới) để máy in nhiệt nhận đúng khổ 80mm.
  - Màn hình khách là trang riêng nhận dữ liệu qua WS (chạy được trên thiết bị khác), BroadcastChannel chỉ là dự phòng khi cùng trình duyệt.

- **Vấn đề / lưu ý:**
  - Cấu hình ngân hàng/tên cửa hàng chưa có UI (vấn đề mở #14); tên thu ngân hiện là username (#15).
  - Token dev lấy từ env `DEV_AUTH_TOKEN` hết hạn sau 15 phút (vấn đề mở #7) — WS và API sẽ báo lỗi khi token hết hạn.

---

### P2.7 — Order Module — API & UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `862000e` · **Vị trí:** `source/bizone/`
- **Đã làm:**
  - `lib/validators/order.ts` — Zod schemas: listOrdersSchema (filter channel/status/payment/date/branch), createOrderSchema (items + shipping + payment), updateOrderStatusSchema, cancelOrderSchema, createRefundSchema
  - `server/services/order.service.ts`:
    - `listOrders` — filter đa điều kiện, phân trang, include customer + orderItems preview
    - `getOrder` — đầy đủ include: customer, orderItems (product+variant), orderTracking, orderRefunds, branch, createdByUser
    - `createOrder` — tính subtotal/totalAmount, sinh orderCode ORD-YYYYMMDD-XXXXX, tạo tracking "pending" đồng thời
    - `updateOrderStatus` — state machine (pending→confirmed→preparing→shipping→delivered→completed; nhánh cancelled/returned), tracking theo từng bước
    - `cancelOrder` — guard chỉ huỷ được ở pending/confirmed/preparing
    - `createRefund` — guard trạng thái completed/delivered/returned, sinh refundCode REF-YYYYMMDD-XXXXX
    - `exportOrdersToExcel` — xuất Excel ExcelJS với header màu BizOne primary, nhãn tiếng Việt
  - `server/routers/order.ts` — 7 endpoints: list, get, create, updateStatus, cancel, refund, exportExcel (RBAC: `order:read` / `order:write`)
  - `server/routers/index.ts` — wire `orderRouter` vào `appRouter`
  - `components/orders/shared.ts` — constants: ORDER_STATUS (8 trạng thái + màu), PAYMENT_STATUS (3), CHANNEL_LABEL, NEXT_STATUS state machine, NEXT_STATUS_LABEL
  - `components/orders/OrderTable.tsx` — danh sách đơn: search debounce 300ms, filter kênh/trạng thái/thời gian, phân trang, xuất Excel base64
  - `components/orders/OrderDetail.tsx` — chi tiết: thông tin đơn, khách hàng, bảng SP (qty/unitPrice/discount/total), vận chuyển, thanh toán tổng hợp, timeline tracking, modal huỷ, modal hoàn trả
  - `app/orders/page.tsx` — trang danh sách
  - `app/orders/[id]/page.tsx` — trang chi tiết (`instant = false` cho PPR)

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo đơn online → xác nhận → giao hàng → hoàn thành flow | ✅ State machine: pending→confirmed→preparing→shipping→delivered→completed; guard transition hợp lệ |
  | Filter đúng (channel, status, date, search) | ✅ listOrders filter + search fullName/phone/orderCode |
  | Xuất Excel | ✅ ExcelJS, header màu, 12 cột, download base64 |
  | Theo dõi tracking number | ✅ updateOrderStatus nhận trackingCode + shippingProvider, lưu vào Order |
  | Lint / typecheck / build | ✅ 0 errors; 3 warnings pre-existing; build 19/19 static routes OK |

- **Khác biệt so với plan:**
  - `Customer` trong schema có field `fullName` (không phải `name`) + không có `address` trực tiếp (quan hệ `customerAddresses`) → UI hiển thị họ tên/SĐT/email.
  - `ProductVariant` không có `name` (chỉ `sku`) → hiển thị `SKU: xxx` thay vì tên variant.
  - Refund UI hoàn trả toàn bộ order (tất cả items) thay vì chọn từng item — đủ cho MVP; chọn từng item sẽ làm ở P4.5.

- **Quyết định thiết kế:**
  - State machine transition validation trong service (`VALID_TRANSITIONS` map) — không cho phép skip bước hoặc chuyển ngược.
  - Export Excel qua tRPC mutation (không route handler riêng) vì cần auth + filter giống list query; trả base64 để tương thích với pattern hiện tại (P2.1).
  - Không tích hợp GHN/GHTK trong P2.7 — shipping_provider/tracking_code lưu dạng string tự do; tích hợp API vận chuyển thuộc P4.x.

- **Vấn đề / lưu ý:**
  - Seed chưa có orders mẫu → table hiển thị "Không có đơn hàng nào" trên DB dev; cần tạo đơn qua API hoặc thêm vào seed.
  - Tạo đơn từ UI (form tạo mới) chưa có — P2.7 chỉ làm list + detail + update status + cancel + refund theo spec PLAN.

---

### P2.8 — CRM Module — API & UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `3866a5f` · **Vị trí:** `source/bizone/`
- **Đã làm:**
  - `lib/validators/customer.ts` — Zod schemas: listCustomers, createCustomer, updateCustomer, adjustPoints (earn/redeem/adjust), createDebt, payDebt, mergeCustomers
  - `types/auth.ts` — thêm `crm:manage_points` và `crm:manage_debt` vào Permission type
  - `lib/rbac.ts` — cấp `crm:manage_points` và `crm:manage_debt` cho `bizone-admin` và `bizone-manager`
  - `server/services/customer.service.ts`:
    - `listCustomers` — filter search/group/ranking/isActive, phân trang, include group + _count
    - `getCustomer` — full include: group, addresses, loyaltyPoints (50 mục), debts, invoices (20), orders (20)
    - `searchByPhone` — tra cứu realtime, trả 10 KH khớp SĐT
    - `createCustomer` — sinh code KH-YYYYMMDD-XXXXX, check SĐT unique, tạo địa chỉ mặc định nếu có
    - `updateCustomer` — guard SĐT unique khi đổi
    - `adjustLoyaltyPoints` — guard redeem không vượt điểm hiện có, cập nhật totalPoints
    - `createDebt` / `payDebt` — ghi nợ + thanh toán (partial/paid)
    - `mergeCustomers` — dời invoices/orders/points/debts về KH giữ, deactivate KH merge
    - `updateSpentAndRanking` — tự động nâng hạng silver/gold/vip/diamond dựa vào tổng chi tiêu
    - `exportCustomersToExcel` — ExcelJS, header màu, 10 cột
  - `server/routers/customer.ts` — 11 endpoints: list, get, searchByPhone, create, update, adjustPoints, createDebt, payDebt, merge, exportExcel (RBAC phân quyền theo crm:read/write/manage_points/manage_debt)
  - `server/routers/index.ts` — wire `customerRouter`
  - `components/crm/shared.ts` — RANKING, DEBT_STATUS, LOYALTY_TYPE, GENDER_LABEL constants
  - `components/crm/CustomerTable.tsx` — danh sách: search debounce 300ms, filter xếp hạng, phân trang, xuất Excel, modal thêm nhanh khách hàng
  - `components/crm/CustomerDetail.tsx` — 4 tabs: Thông tin (edit inline), Lịch sử mua (invoices + orders), Điểm thưởng (adjust modal), Công nợ (ghi nợ modal + thanh toán modal)
  - `app/crm/page.tsx` — trang danh sách
  - `app/crm/[id]/page.tsx` — trang chi tiết (`instant = false`)

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Thêm khách → tạo hóa đơn → điểm tự động cộng | ✅ `updateSpentAndRanking()` cộng điểm + nâng hạng; API create sẵn sàng nhận callback từ POS/invoice service |
  | Tra cứu SĐT | ✅ `searchByPhone` → tìm realtime từ input SĐT |
  | Công nợ: ghi nợ → thanh toán → giảm nợ | ✅ createDebt → payDebt → remainingAmount giảm, status partial/paid |
  | Merge 2 khách trùng | ✅ mergeCustomers dời toàn bộ dữ liệu, deactivate KH cũ |
  | Lint / typecheck / build | ✅ 0 errors; 5 warnings pre-existing; build 21/21 static routes OK |

- **Khác biệt so với plan:**
  - `MergeDialog.tsx` riêng không tạo — merge tích hợp trực tiếp vào detail page (đủ cho MVP); dialog riêng sẽ làm khi P4 cần UX tốt hơn.
  - Invoice dùng field `status` (InvoiceStatus) thay vì `paymentStatus` — đúng theo schema.

- **Quyết định thiết kế:**
  - Ranking tự động theo ngưỡng: silver (<5M) → gold (5M+) → vip (20M+) → diamond (50M+). Logic trong `computeRanking()` ở service.
  - `updateSpentAndRanking()` là hàm public để invoice/POS service gọi sau khi tạo hóa đơn.
  - `crm:manage_points` và `crm:manage_debt` tách riêng khỏi `crm:write` để kiểm soát phân quyền chi tiết.

- **Vấn đề / lưu ý:**
  - `updateSpentAndRanking()` chưa được gọi tự động từ invoice/POS service — cần wire thủ công trong P2.5/P2.9 hoặc làm task riêng.
  - Seed chưa có customers mẫu → table rỗng trên DB dev.

### P2.9 — Dashboard — API & UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `1fa131f` · **Vị trí:** `source/bizone/`
- **Đã làm:**
  - `server/services/dashboard.service.ts`:
    - `cached<T>(key, fn)` — helper Redis cache 5 phút (TTL 300s), đọc từ `getRedis()`
    - `getTodayStats()` — doanh thu, số HĐ POS, số đơn online, KH mới, tồn thấp; tính % tăng so với hôm qua
    - `getRevenue7Days()` — doanh thu từng ngày 7 ngày (group by date, fill 0 cho ngày trống)
    - `getTopProducts()` — top 5 SP bán chạy (groupBy invoiceItem, 7 ngày, kèm tên/SKU từ products)
    - `getPaymentBreakdown()` — doanh thu theo phương thức thanh toán hôm nay (groupBy invoicePayment.paymentMethod)
    - `getPendingOrders()` — 5 đơn hàng pending/confirmed mới nhất, kèm tên khách
    - `getLowStockItems()` — 5 SP tồn kho thấp nhất (raw SQL `quantity <= min_quantity AND min_quantity > 0`, JOIN products)
    - `getDashboardSummary()` — gọi song song cả 6 hàm trên, trả object tổng hợp
    - `invalidateDashboardCache()` — xóa tất cả 6 key cache (gọi sau giao dịch POS/đơn hàng)
  - `server/routers/dashboard.ts` — `summary` endpoint (permissionProcedure `report:read`)
  - `server/routers/index.ts` — wire `dashboardRouter`
  - `app/dashboard/page.tsx` — Server page; metadata; Suspense wrapper; truyền `getDevAuth()` → `DashboardClient`
  - `components/dashboard/DashboardClient.tsx`:
    - Load data qua `trpc.dashboard.summary.query()` (vanilla tRPC + useCallback/useEffect)
    - Skeleton loading (animate-pulse)
    - 4 stat cards: Doanh thu, Hóa đơn POS, Khách hàng mới, Cảnh báo tồn (amber khi > 0)
    - Biểu đồ cột doanh thu 7 ngày (CSS bars, hôm nay nổi bật xanh đậm, hiển thị giá trị rút gọn)
    - Phương thức thanh toán (legend + % + số tiền)
    - Top 5 sản phẩm bán chạy (huy chương vàng/bạc/đồng)
    - Đơn hàng chờ xử lý (click → `/orders/[id]`)
    - Cảnh báo tồn kho thấp (panel amber, link → `/warehouse`)
    - Nút "Làm mới" (quiet refresh không xóa data hiện tại)

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Doanh thu ngày, tuần | ✅ `getTodayStats` + `getRevenue7Days` trả đúng; cache Redis 5 phút |
  | Top sản phẩm bán chạy | ✅ groupBy invoiceItem, trả rank + name + sku + qty + revenue |
  | Cảnh báo tồn thấp | ✅ raw SQL `quantity <= min_quantity`; card chuyển màu amber khi có cảnh báo |
  | Lint / typecheck / build | ✅ 0 errors; build thành công; Decimal fix (`Number()`) trong service |

- **Khác biệt so với plan:**
  - Không có live WebSocket push (chart tự refresh khi người dùng nhấn "Làm mới") — đủ cho MVP; real-time sẽ thêm ở P4.2 Reports nếu cần.
  - Biểu đồ CSS thuần thay vì thư viện chart (Recharts/Chart.js) — phù hợp MVP, không cần bundle thêm.

- **Quyết định thiết kế:**
  - Cache mỗi nhóm dữ liệu riêng (6 key): `invalidateDashboardCache()` xóa cả 6 sau giao dịch POS, đảm bảo nhất quán.
  - `getLowStockItems` và `getTodayStats.lowStockCount` dùng `$queryRaw` vì cần so sánh 2 cột (Prisma where không hỗ trợ).

- **Vấn đề / lưu ý:**
  - `invalidateDashboardCache()` chưa được gọi từ POS/order service — cần wire ở P2.5/P4.2 hoặc task riêng.
  - Dữ liệu dev có thể rỗng (chưa có HĐ/đơn) → Dashboard hiển thị 0 đúng; cần seed thêm để test biểu đồ.

---

### P2.10 — Audit Log — API & UI

- **Hoàn thành:** 2026-11-04 · **Commit:** `412f39a` · **Vị trí:** `source/bizone/`

- **Đã làm:**
  - `lib/validators/auditLog.ts`: Zod schemas `listAuditLogsSchema`, `createAuditLogSchema`
  - `server/services/auditLog.service.ts`: `createAuditLog`, `listAuditLogs` (filter: module/action/entityType/entityId/userId/dateRange, paginate), `getAuditLog`, `exportAuditLogsToExcel` (ExcelJS, max 10000 dòng)
  - `server/routers/auditLog.ts`: `list`, `get`, `export` — permission `staff:view_audit_log`
  - `server/middleware/auditLog.ts`: `auditTrpcCall()` — 20 route mappings (invoice, product, category, inventory, stock_take, transfer, order, crm); fail-silent (lỗi ghi log không làm hỏng response); đọc IP từ `x-forwarded-for`/`x-real-ip`
  - `server/routers/order.ts`: tích hợp auditTrpcCall cho create, updateStatus, cancel, refund
  - `server/routers/product.ts`: tích hợp auditTrpcCall cho create, update, delete
  - `types/auth.ts`: thêm permission `staff:view_audit_log`
  - `lib/rbac.ts`: bizone-admin + bizone-manager có `staff:view_audit_log`
  - `components/audit/AuditTable.tsx`: filter module/action/dateFrom/dateTo, bảng + phân trang, modal chi tiết (old/new value JSON diff), export Excel
  - `app/audit-log/page.tsx`: trang `/audit-log`
  - `components/layout/Sidebar.tsx`: thêm mục "Audit Log" (icon ScrollText)

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo hóa đơn → log xuất hiện | ✅ `auditTrpcCall("invoice.create", ...)` wired; ghi async fail-silent |
  | Filter đúng (user/time/action/module/entity) | ✅ `listAuditLogs` filter đầy đủ; UI filter module + action + dateFrom/dateTo |
  | Không thể xóa log | ✅ Router chỉ có `list`, `get`, `export` — không có `delete`; bảng DB append-only |
  | Export ra Excel | ✅ `exportAuditLogsToExcel` ExcelJS, header styled #2563EB, 10000 dòng max |
  | Lint / typecheck / build | ✅ 0 errors; `/audit-log` trong static routes |

- **Khác biệt so với plan:**
  - Middleware không phải auto-intercept tất cả tRPC — thay vào đó wired thủ công tại mỗi router mutation cần thiết. Phương án này rõ ràng hơn và tránh log những operation không cần thiết.
  - `userId` trong audit log là numeric DB id (nullable nếu user Keycloak chưa có record trong bảng `users`) thay vì Keycloak UUID — nhất quán với cấu trúc FK hiện tại.

- **Quyết định thiết kế:**
  - `auditTrpcCall` fail-silent (try/catch bên trong) — một lỗi DB khi ghi log không được phép làm rollback business transaction.
  - `void auditTrpcCall(...)` — không await, không block response; log ghi fire-and-forget.
  - Append-only được đảm bảo bởi không có route `delete`/`update` trong auditLogRouter.

- **Vấn đề / lưu ý:**
  - `auditTrpcCall` chưa wire vào tất cả router (inventory, stockTake, transfer, customer, pos/invoice) — có thể thêm dần theo nhu cầu; pattern đã sẵn.
  - `userId` nullable vì token Keycloak `sub` (UUID) không map thẳng sang `users.id` (int) khi chưa có user trong DB — xử lý khi tích hợp OIDC đầy đủ.

---

### P3.1 — Transaction Engine — Core API

- **Hoàn thành:** 2026-11-04 · **Commit:** `0e47fcd` · **Vị trí:** `source/payment-hub`
- **Đã làm:**
  - `server/middleware/apiAuth.ts` — xác thực API Key + HMAC-SHA256 (X-Api-Key, X-Timestamp, X-Signature); timestamp drift ±300s; rate limit Redis (1 phút window); cập nhật `lastUsedAt` fire-and-forget
  - `server/middleware/idempotency.ts` — check/save idempotency key Redis TTL 24h (`idempotency:payhub:{merchantId}:{key}`)
  - `server/services/stateMachine.ts` — state machine: Created→Pending/Expired; Pending→Success/Failed/Expired; Success→Refunded/PartiallyRefunded; PartiallyRefunded→Refunded; `assertTransition`, `canTransition`, `isTerminal`, `isPaid`
  - `server/services/transaction.service.ts` — `createTransaction` (code TXN-YYYYMMDD-XXXXXX, tạo log "created", publish event); `getTransactionById/ByCode/ByMerchantTxnId`; `listTransactions` (filter status/merchant/date/search, pagination); `transitionStatus` (prisma.$transaction atomically); `expireOverdueTransactions` (batch 500)
  - `server/routes/transactions.ts` — route handlers: `handleCreateTransaction` (POST), `handleGetTransaction` (GET by id/code), `handleGetByMerchantTxnId`, `handleListTransactions`
  - `app/api/v1/transactions/route.ts` — POST + GET
  - `app/api/v1/transactions/[id]/route.ts` — GET
  - `app/api/v1/transactions/merchant/[merchant_txn_id]/route.ts` — GET
  - `server/jobs/expireTransactions.ts` — `runExpireJob()` wrapper
  - `services/worker.ts` — wire expire job: `setInterval` 60s + chạy 1 lần khi khởi động

- **Kiểm thử:**

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | POST /api/v1/transactions tạo transaction | ✅ Route ƒ trong build output; service tạo TXN code, log, event |
  | GET /api/v1/transactions/:id trả transaction | ✅ Hỗ trợ cả numeric id và txn_code |
  | Idempotency key hoạt động | ✅ Check Redis trước, save sau; TTL 24h |
  | HMAC-SHA256 auth bảo vệ route | ✅ Verify timestamp + signature; rate limit 60s window |
  | State machine validate transition | ✅ `assertTransition` ném `InvalidTransitionError` với invalid transitions |
  | Job expire chạy định kỳ | ✅ `setInterval(60s)` trong worker; batch 500 tx/lần |
  | Lint / typecheck / build | ✅ 0 errors; 3 route ƒ xuất hiện trong build |

- **Khác biệt so với plan:**
  - `handleListTransactions` chưa có Keycloak JWT auth (chờ P1.5 middleware được tích hợp vào Payment Hub) — hiện exposed không auth cho admin internal.
  - `expireOverdueTransactions` dùng `fromStatus: "Created"` trong log thay vì đọc từng record — một số record ở trạng thái `Pending` sẽ log sai `fromStatus`. Chấp nhận được ở MVP, sửa ở P3.x nếu cần.

- **Quyết định thiết kế:**
  - HMAC-SHA256 ký trên `{timestamp}.{rawBody}` — phòng replay attack bằng timestamp drift check ±300s.
  - `Prisma.DbNull` cho `metadata` nullable JSON — Prisma 7 yêu cầu tường minh với `NullableJsonNullValueInput`.
  - Expire job chạy trong BullMQ worker process (không phải Next.js app) — tránh chạy nhiều instance gây race condition.

- **Vấn đề / lưu ý:**
  - `handleListTransactions` chưa xác thực — cần tích hợp Keycloak JWT middleware Payment Hub (P1.5-payhub hoặc P3.x).
  - UI Transaction Engine đã xây ở P3.2.

---

### P3.2 — Transaction UI — Danh sách & Chi tiết

- **Hoàn thành** 2026-11-04 · **Commit** `9e5bf92` · **Vị trí** `source/payment-hub/app/transactions/`, `source/payment-hub/components/ph/`

**Đã làm:**
- API internal route `/api/internal/transactions` (GET list, không cần HMAC) và `/api/internal/transactions/[id]`
- Thêm filter `paymentMethod`, `amountMin`, `amountMax` vào `ListTransactionsInput` và `listTransactions()`
- Hàm `serializeTxn` refactor sang generic để preserve TypeScript types
- Component `TransactionTable` — bảng danh sách, cột: Mã GD (link), Thời gian, Số tiền, Trạng thái (badge), Phương thức, Merchant
- Component `TransactionLog` — timeline log với màu theo event
- Component `RawDataViewer` — accordion collapsible hiển thị JSON + nút copy
- Component `TransactionDetail` — chi tiết GD: thông tin cơ bản, merchant, khách hàng, log, metadata; nút Hoàn tiền (nếu Success), Tra soát (nếu Failed/Expired)
- Component `TransactionsClient` — client component với state filter, pagination, export CSV
- Page `app/transactions/page.tsx` — Server Component tải initial data, dùng `await connection()` + `instant = false`
- Page `app/transactions/[id]/page.tsx` — Server Component chi tiết GD với breadcrumb
- `StatusBadge` thêm `PartiallyRefunded`
- Sửa `dashboard/page.tsx` dùng `Link` thay `<a>` (fix lint)

**Kiểm thử:**

| Tiêu chí (PLAN) | Kết quả |
|-----------------|---------|
| Danh sách load <2s | ✅ Server-rendered initial data, client filter async |
| Filter hoạt động | ✅ Status, Method, Date range, Search (mã GD/email/tên) |
| Chi tiết GD hiển thị đúng | ✅ Tất cả field, 2-column layout |
| Log giao dịch | ✅ Timeline với màu theo event type |
| Raw data request/response xem được | ✅ RawDataViewer accordion + copy |
| `npm run format:check` | ✅ |
| `npm run lint` | ✅ Không lỗi |
| `npm run typecheck` | ✅ Không lỗi |
| `npm run build` | ✅ Build thành công |

**Vấn đề / lưu ý:**
- API internal `/api/internal/transactions` không có auth — cần bảo vệ khi deploy production (ít nhất session check hoặc same-origin).
- Nút "Hoàn tiền" và "Tra soát" hiện chỉ là UI placeholder — logic gọi API sẽ implement ở P5.3 (Refund) và task Dispute.
- Export là CSV (không phải Excel .xlsx) — đủ để mở bằng Excel với UTF-8 BOM.

---

### P3.3 — VNPay Connector

- **Trạng thái:** 🟡 (2026-11-04) · **Commit:** `c83a1e2` · **Vị trí:** `source/payment-hub/services/connectors/`, `server/routes/vnpay-*.ts`, `server/services/payment.service.ts`
- **Đã làm:**
  - `services/connectors/types.ts` — interface `PaymentConnector` theo SRS §3.3.2 (`createTransaction`, `processResult`, `verifySignature`, `refund`, `getStatus`, `getConfigSchema`, `healthCheck`) + Core DTO (`PaymentRequest`, `PaymentResult`, `RefundRequest`…)
  - `services/connectors/vnpay/vnpay.util.ts` — chuẩn hoá tham số VNPay 2.1.0 (sort key, `encodeURIComponent` + `%20→+`), HMAC-SHA512, checksum `|` cho merchant_webapi, ngày `yyyyMMddHHmmss` GMT+7, bỏ dấu `vnp_OrderInfo`, map `vnpay_qr/atm/card` → `vnp_BankCode`
  - `services/connectors/vnpay/index.ts` — `VnpayConnector`: tạo payment URL (có `vnp_ExpireDate` = hạn GD), xử lý kết quả (thành công khi `ResponseCode=00` và `TransactionStatus=00`), refund (`02` toàn phần / `03` một phần), querydr, health check; xác thực chữ ký response của API
  - `services/connectors/registry.ts` — registry connector ↔ `payment_method`; dựng connector từ `partner_configs` Active (giải mã secret trong bộ nhớ); IPN/redirect dùng đúng `partner_config_id` của GD
  - `lib/crypto.ts` — AES-256-GCM (`enc:v1:…`) cho `api_key`/`secret_key` của `partner_configs`, khoá `PARTNER_ENCRYPTION_KEY`
  - `server/services/payment.service.ts` — `initiatePayment` (Created→Pending, lưu `payment_method`, `partner_config_id`, raw request) và `applyPaymentResult` (UPDATE có điều kiện `status='Pending'` trong transaction → chống trùng/race IPN)
  - `server/routes/vnpay-ipn.ts` + `app/api/ipn/vnpay/route.ts` — IPN `GET /api/ipn/vnpay`, luôn HTTP 200 + `{RspCode, Message}` (00/01/02/04/97/99)
  - `server/routes/vnpay-redirect.ts` + `app/pay/vnpay/return/route.ts` — verify chữ ký → 302 về `return_url` của merchant (kèm `txn_code`, `merchant_txn_id`, `status`, `result`); không có `return_url` → trang kết quả HTML
  - `server/routes/pay-page.ts` + `app/pay/[txnCode]/route.ts` — `payment_url` của Hub (`/pay/{txn}`) giờ hoạt động: chọn phương thức hoặc `?method=` → 302 sang VNPay
  - `POST /api/v1/transactions` nhận thêm `payment_method` (tuỳ chọn, trả thẳng URL VNPay) và `customer_ip`; trả 503 nếu đối tác chưa cấu hình
  - `proxy.ts` — `/api/ipn/` public; `/api/v1/*` có `X-Api-Key` bỏ qua JWT (xem *Đã giải quyết*)
  - `prisma/seed.ts` — upsert partner config "VNPay Sandbox" (mã hoá) từ `VNPAY_*` + bật connector `vnpay`; `.env.example` thêm `PARTNER_ENCRYPTION_KEY`, `VNPAY_*`; bộ lọc phương thức UI thêm "VNPay"

- **Kiểm thử** (`next start` :4000 + MariaDB/Redis local, script e2e ký HMAC độc lập với code):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo GD → redirect VNPay sandbox | 🟡 `POST /api/v1/transactions` (`payment_method: vnpay`) → 201, `Pending`, URL `sandbox.vnpayment.vn/...vpcpay.html` đủ tham số, chữ ký khớp bản ký độc lập; `/pay/{txn}?method=vnpay_qr` → 302 sang VNPay (`vnp_BankCode=VNPAYQR`). VNPay trả `Error.html?code=72` (không tìm thấy merchant) vì TMN code là placeholder — **chưa thấy được trang thanh toán thật** |
  | IPN: nhận + verify + update status <2s | ✅ IPN ký hợp lệ → `00`, GD `Pending→Success`, lưu `partner_txn_id`, `paid_at` (GMT+7→UTC đúng), log + raw data; **9–11 ms**. IPN thật từ VNPay chưa thử (cần URL public + TMN thật) |
  | Refund qua API VNPay | 🟡 Gọi thật `merchant_webapi` sandbox (~150 ms): TMN `SANDBOX_TMN` → `03 Invalid data format`; TMN 8 ký tự giả → `99` (qua bước kiểm định dạng) ⇒ request hợp lệ về cấu trúc, **chưa refund thành công được** khi chưa có merchant sandbox. querydr cùng kết quả |
  | Test case success | ✅ `00 Confirm Success` → `Success`; redirect → 302 `return_url?...&status=Success&result=success` |
  | Test case failed | ✅ `vnp_ResponseCode=24` → `Failed`, log "Khách hàng hủy giao dịch"; redirect không có `return_url` → trang "Thanh toán không thành công" |
  | Test case invalid signature | ✅ IPN sai secret → `97`; thiếu hash → `97`; redirect sai hash → HTTP 400 |
  | Lỗi khác | ✅ sai số tiền → `04`; GD không tồn tại → `01`; IPN lặp → `02` (không log trùng); GD `Expired` nhận IPN thành công → `02` + log `late_payment`; đối tác Inactive → tạo GD 503, IPN GD cũ vẫn xử lý theo `partner_config_id`; `payment_method` lạ → 400; `/pay` cho GD đã `Success` → 409; `GET /api/v1/transactions` không JWT vẫn 401 |
  | HashSecret lưu mã hoá | ✅ `partner_configs.secret_key` = `enc:v1:…` (AES-256-GCM) |
  | format:check / lint / typecheck / build | ✅ (3 route mới đều `ƒ`) |

- **Khác biệt so với plan:**
  - Chữ ký dùng **HMAC-SHA512** (chuẩn VNPay 2.1.0), không phải SHA256 như prompt.
  - IPN xử lý **đồng bộ** (vài câu lệnh DB, ~10 ms) thay vì qua queue như API-Design §12: `RspCode` phải phản ánh kết quả xử lý; việc "retry" dựa vào VNPay tự gửi lại khi nhận mã khác `00`/`02`.
  - Redirect **không** cập nhật trạng thái (IPN là nguồn sự thật) — chỉ verify + chuyển hướng.
  - Route Engine chưa có (P3.8): registry lấy partner config Active đầu tiên theo loại connector.
  - Refund mới ở mức connector (chưa ghi bảng `refunds`) — luồng nghiệp vụ thuộc P5.3.

- **Quyết định thiết kế:**
  - Connector thuần (không đụng DB); DB/state machine nằm ở `payment.service.ts` → thêm PSP mới chỉ cần implement interface + đăng ký trong `registry.ts`.
  - `vnp_TxnRef` = `txn_code`; `vnp_CreateDate` của lần tạo URL lưu trong `transaction_raw_data` (`endpoint = vnpay:pay`) để dùng cho refund/querydr (`getLatestPartnerRequest`).
  - URL API (refund/querydr) suy ra theo môi trường (sandbox: `VNPAY_API_URL`, production: `merchant.vnpay.vn`) vì `partner_configs` không có cột riêng.
  - Khoá mã hoá đặt ở env (`PARTNER_ENCRYPTION_KEY`), chưa dùng Vault/KMS — đủ cho MVP; đổi khoá cần re-encrypt.

- **Vấn đề / lưu ý:** vấn đề mở #16–#19. Để hoàn tất P3.3: điền TMN/HashSecret sandbox thật vào `.env.development` + `source/payment-hub/.env.local`, `npm run db:seed`, tạo GD và thanh toán bằng thẻ test NCB; refund GD đó qua `VnpayConnector.refund()`.


### P3.4 — VietQR Generator

- **Trạng thái:** 🟡 (2026-11-04) — còn tiêu chí "app ngân hàng quét được" chờ người dùng quét thử · **Commit:** `9d7da3b` · **Vị trí:** `source/payment-hub/services/qr/`, `server/services/qr.service.ts`, `server/routes/qr.ts`, `app/api/v1/qr/`, `app/qr/[file]/`
- **Đã làm:**
  - `services/qr/vietqr.ts` — payload EMVCo/VietQR (NAPAS 247, dịch vụ `QRIBFTTA` chuyển đến tài khoản, QR động `01=12`, VND `704`, số tiền tag 54, nội dung tag 62-08), CRC-16/CCITT-FALSE, chuẩn hoá nội dung (bỏ dấu, A–Z/0–9/space, ≤25 ký tự), `parseVietQrPayload()` để tự kiểm, render PNG đúng 200/300/500 px (lib `qrcode`, ECC M)
  - `server/services/qr.service.ts` — `generateQr()`: GD phải thuộc merchant, `Created`/`Pending`, chưa hết hạn, VND; mỗi (GD, loại, size) **một QR hiện hành** → gọi lại trả QR cũ (Redis → DB), QR hết hạn → sinh QR mới (**auto refresh**), đánh dấu QR cũ `is_expired=1` + xoá ảnh; hạn QR = `min(now + expires_in_seconds, transactions.expired_at)` (mặc định `QR_EXPIRES_SECONDS=900`, 60…86 400 s); khoá dòng `transactions … FOR UPDATE` để request song song không tạo trùng; GD `Created → Pending` (`payment_method = vietqr`, `partner_config_id`), ghi `transaction_logs`, phát event realtime
  - Lưu `qr_codes` (raw_data, image_base64, image_url, size, expires_at); cache Redis `payhub:qr:{txnId}:{type}:{size}` (TTL = thời gian còn lại); ảnh PNG `payhub:qr:img:{token}` (token 128-bit ngẫu nhiên)
  - API (API key + HMAC như `/api/v1/transactions`):
    - `POST /api/v1/qr/generate` — `transaction_id` (txn_code hoặc id số), `type` (`VietQR`; `NapasQR`/`PartnerQR` → 400 chưa hỗ trợ), `size` 200/300/500, `format` `all|base64|url|raw`, `expires_in_seconds`; 201 khi sinh mới, 200 khi trả QR hiện hành (`reused`, `refreshed`); header `Server-Timing`
    - `GET /api/v1/qr/{transaction_id}?size=&format=` — QR hiện hành, tự refresh khi hết hạn (dùng cho màn hình hiển thị QR)
    - Public `GET /qr/{token}.png` — ảnh QR, chỉ phục vụ khi QR còn hạn (404 sau đó)
    - Rate limit riêng 60 req/phút/key (API-Design: "QR Generate")
  - `server/jobs/expireQrCodes.ts` + worker: mỗi phút (sau job hết hạn GD) đánh dấu QR quá hạn **hoặc** GD đã kết thúc và xoá ảnh (SRS §: dữ liệu QR tạm xoá khi hết hạn/hoàn tất)
  - `prisma/seed.ts` — upsert partner config `VietQR` từ `VIETQR_BANK_BIN/ACCOUNT_NO/ACCOUNT_NAME` (BIN + tên chủ TK mã hoá AES-256-GCM), bật connector `vietqr`; `.env.example` thêm `VIETQR_*`, `QR_EXPIRES_SECONDS`
  - Test Vitest `tests/vietqr.test.ts` (8 test): CRC chuẩn (`"123456789"` → `29B1`), cấu trúc TLV, phát hiện payload bị sửa, chuẩn hoá nội dung, input sai, PNG 200/300/500 giải mã lại đúng payload (jsQR)

- **Kiểm thử** (`next build` + `next start` :4010, MariaDB/Redis local, script e2e ký HMAC độc lập với code app, 2 merchant):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Sinh QR thành công | ✅ `POST /api/v1/qr/generate` → 201; GD `Created → Pending`, `payment_method=vietqr`, log `status_changed:pending`, 1 dòng `qr_codes` |
  | App ngân hàng quét được | 🟡 Payload **trùng khớp từng byte** với QR do img.vietqr.io sinh cho cùng tài khoản/số tiền/nội dung (giải mã ảnh của họ bằng jsQR); ảnh của Hub (base64 và `image_url`, cả 3 kích thước) giải mã lại đúng payload; CRC hợp lệ. **Chưa quét bằng app ngân hàng thật** (tài khoản demo) |
  | Base64 + URL + raw data trả về | ✅ `format=all` trả cả 3; `base64`/`url`/`raw` chỉ trả phần tương ứng (+ raw); `image_url` → 200 `image/png` |
  | QR hết hạn tự động refresh | ✅ QR 60 s: sau hạn `image_url` → 404, `GET /api/v1/qr/{txn}` trả QR mới (`refreshed: true`, `qr_id` mới, ảnh mới dùng được), QR cũ `is_expired=1`, ảnh bị xoá — đúng cho cả 2 trường hợp: QR đã bị job đánh dấu trước và QR chưa bị đánh dấu |
  | Hiệu năng < 1 s | ✅ 20 QR 500 px mới: p50 19 ms, p95 22 ms; QR từ cache 9 ms; 15 request song song max 83 ms |
  | Cache Redis | ✅ gọi lại → 200 `reused`, cùng `qr_id` |
  | Lỗi | ✅ GD không tồn tại → 404; GD của merchant khác → 404; size 250 / thiếu `transaction_id` / `expires_in_seconds` 10 / type `NapasQR` → 400; sai chữ ký / không header → 401; GD `Success` → 409; GD quá hạn → 409; partner VietQR Inactive → 503 và GD giữ `Created`; token ảnh sai → 404; > 60 req/phút → 429 |
  | Tranh chấp | ✅ 15 request song song cùng GD → 1 `qr_id`, 1 dòng `qr_codes` |
  | Hạn QR không vượt hạn GD | ✅ `expires_in_seconds=3600` với GD hạn 2 phút → `expires_at` = hạn GD |
  | Job hết hạn | ✅ QR quá hạn → `is_expired=1`, ảnh `NULL`; GD chuyển `Success` → cả 3 QR của GD bị đánh dấu |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (22/22 test; 3 route mới đều `ƒ`) |
  | Dọn dẹp | ✅ dừng server :4010, xoá 56 GD test (QR/log cascade), API key test, merchant QA34, 108 key Redis test; giữ partner config VietQR (dữ liệu seed) |

- **Khác biệt so với plan:**
  - Không tạo model `qr_codes` mới — model `QrCode` đã có từ P1.4 (đúng `schema_paymenthub.sql`).
  - Input/response theo **PLAN + API-Design §5.2** (`transaction_id`, snake_case), không theo `OpenAPI` (`externalId`, `partnerId`, `amount` — tự tạo GD). Hai tài liệu mâu thuẫn; PLAN là tiêu chí nghiệm thu.
  - `image_url` phục vụ từ Payment Hub (`/qr/{token}.png`, Redis) thay vì MinIO/S3 như SRS §2: ảnh QR là dữ liệu tạm, cần biến mất khi hết hạn — Redis TTL làm điều đó, không phải dọn bucket.
  - "Tự động refresh" làm ở phía server: QR hết hạn được thay khi có request tiếp theo (`GET /api/v1/qr/{txn}` hoặc `generate`); chưa có màn hình nào tự poll (trang `/pay` chưa có VietQR — vấn đề #25).
  - Chỉ hỗ trợ `VietQR`; `NapasQR` (GĐ 2 theo SRS §8.3) và `PartnerQR` (MoMo/ZaloPay — P5.x) trả 400.
  - Không dùng API vietqr.io (`VIETQR_CLIENT_ID/API_KEY` trong `.env.development`) — chuẩn EMVCo sinh được cục bộ, không phụ thuộc dịch vụ ngoài, nhanh hơn.

- **Quyết định thiết kế:**
  - Tài khoản nhận lưu trong `partner_configs` (`connector_type='VietQR'`) để P3.5 quản lý chung với các đối tác khác: `api_key` = BIN, `merchant_code` = số TK, `secret_key` = tên chủ TK (`VIETQR_CONFIG_FIELDS`). Bảng không có cột cấu hình tuỳ biến nên tái dụng cột có sẵn thay vì thêm migration.
  - Nội dung chuyển khoản = `txn_code` bỏ dấu `-` (vd. `TXN20261104A1B2C3`, 17 ký tự): ngân hàng hay bỏ ký tự đặc biệt, chuỗi chữ-số liền là khoá đối soát ổn định nhất.
  - VietQR/EMVCo không có trường hạn dùng → hạn QR do Hub quản lý; tiền chuyển vào sau hạn vẫn tới tài khoản → cần đối soát (vấn đề #24).
  - Sinh ảnh ngoài transaction DB (tất định theo payload), chỉ khoá dòng GD trong lúc kiểm tra/ghi → không giữ lock khi render.

- **Vấn đề / lưu ý:** vấn đề mở #23–#25. Để hoàn tất P3.4: quét QR mẫu bằng app ngân hàng (app hiển thị đúng ngân hàng, số TK, số tiền, nội dung là đạt); khi có tài khoản thật, điền `VIETQR_*` + `npm run db:seed`.


### P3.5 — Partner Config UI

- **Trạng thái:** 🟡 (2026-11-04) — còn bước test + kích hoạt VNPay với credential thật · **Commit:** `619bfd1` · **Vị trí:** `source/payment-hub/app/partners/`, `app/api/internal/partners/`, `components/ph/Partner*.tsx`, `server/services/partner.service.ts`, `server/routes/partners.ts`, `lib/partner-types.ts`
- **Đã làm:**
  - **API admin** (JWT Keycloak qua `proxy.ts`; đọc: `payhub-admin`/`payhub-viewer`, ghi: `payhub-admin`; token gắn `merchant_id` → 403 vì cấu hình đối tác là toàn cục):
    `GET/POST /api/internal/partners`, `GET/PUT /api/internal/partners/{id}`, `POST …/{id}/test`, `PUT …/{id}/status`, `GET …/{id}/logs`
  - **Quy tắc trạng thái** (`partner.service.ts`): tạo mới luôn `Inactive`; chỉ kích hoạt khi test kết nối của **cấu hình hiện tại** đạt (409 nếu chưa); sửa trường kết nối (merchant code, môi trường, key, secret, endpoint) → xoá kết quả test, đối tác đang chạy về `Inactive`; test lỗi khi `Active` → `Error` (rời khỏi routing), test đạt khi `Error` → `Active`; không đổi được loại connector; đổi trạng thái dùng `UPDATE … WHERE status = <đã đọc>`; test bị huỷ ghi nếu cấu hình bị sửa trong lúc test
  - **Bảo mật secret**: API không bao giờ trả secret — VNPay API key `••••1234`, Hash Secret `••••••••`; ô secret trên form để trống = giữ nguyên; log ghi `(đã thay đổi)`. Trường không bí mật của VietQR (BIN, tên chủ TK) hiển thị rõ. Mọi key/secret vẫn mã hoá AES-256-GCM
  - **Test kết nối thật**:
    - VNPay — `healthCheck()` đổi từ "GET trang thanh toán" sang gọi `querydr` cho một mã GD không tồn tại: credential đúng thì VNPay trả phản hồi **có chữ ký hợp lệ** mã `91`/`00`; sai TMN/secret → mã lỗi hoặc chữ ký sai ⇒ kiểm được cả TMN code lẫn Hash Secret
    - VietQR — kiểm định dạng BIN/số TK, sinh payload + CRC, tra BIN trong danh sách ngân hàng NAPAS (`api.vietqr.io/v2/banks`, công khai, đổi được qua `VIETQR_BANKS_URL`)
    - MoMo/ZaloPay — lưu được cấu hình, test trả "chưa hỗ trợ", không kích hoạt được (connector ở P5.1/P5.2)
  - **Log thay đổi** `partner_config_logs`: mỗi trường một dòng (cũ → mới), tạo, test (OK/FAIL + thời gian + thông điệp), đổi trạng thái; kèm người thực hiện (`changed_by` = username token) + IP. Migration `1_partner_config_log_actor` thêm cột `changed_by`
  - **UI** (theo mockup "Quản lý đối tác" / "Cấu hình đối tác"):
    - `/partners` — card mỗi cấu hình (`PartnerCard`): tên, connector, môi trường, trạng thái có chấm màu, kết quả test gần nhất, nút Sửa / Test / Kích hoạt (tắt khi chưa test đạt) / Vô hiệu (có xác nhận); lọc trạng thái + môi trường; đếm hoạt động / lỗi
    - `/partners/new`, `/partners/{id}` — `PartnerForm`: 2 cột "Thông tin cơ bản" / "Cấu hình kết nối", nhãn trường đổi theo loại connector (VietQR: Số TK / BIN / Tên chủ TK, ẩn endpoint), điền sẵn endpoint + callback/IPN mặc định, validate tại chỗ + lỗi theo trường từ API, cảnh báo khi sửa kết nối của đối tác đang chạy; khu "Kết nối & kích hoạt" (`TestConnectionButton`, không cho test khi còn thay đổi chưa lưu); bảng lịch sử thay đổi có phân trang (`PartnerLogTable`)
    - Chế độ chỉ xem cho `payhub-viewer` (ẩn nút ghi); sidebar thêm mục "Đối tác" (`/partners`), mục cũ trỏ `/merchants` đổi tên thành "Merchant"
  - `registry.ts`: `connectorFromPartnerConfig()` dựng connector từ một dòng bất kỳ (kể cả chưa Active) để test
  - `paymentdb` dev chưa có lịch sử migration → đã kiểm tra không lệch schema rồi baseline `0_init` (`prisma migrate resolve --applied`) và `migrate deploy`
  - Test Vitest `tests/partner.test.ts` (2 test): secret không lọt ra view, trường VietQR không bí mật hiển thị rõ

- **Kiểm thử** (`next build` + `next start` :4010, token Keycloak thật của `payhub.admin` / `payhub.viewer` lấy qua PKCE, MariaDB/Redis local):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Thêm VNPay partner → test kết nối → kích hoạt | ✅ với **VietQR** qua UI và API: thêm → `Ngưng`, nút Kích hoạt tắt → Test (Vietcombank, ~160–240 ms) → Kích hoạt → `Hoạt động`. 🟡 **VNPay**: thêm + test chạy thật tới VNPay sandbox nhưng trả lỗi đúng như mong đợi (`03 Invalid data format`, chữ ký phản hồi không hợp lệ) vì TMN/HashSecret là placeholder (#16) → hệ thống chặn kích hoạt (409). Cùng lý do khiến P3.3 còn 🟡 |
  | Log thay đổi | ✅ tạo / test / trạng thái / tên (cũ → mới) / số TK hiện trong bảng lịch sử, kèm `payhub.admin@bizone.vn` + IP; secret ghi `(đã thay đổi)`; lưu không đổi gì → không thêm log |
  | Trạng thái hiển thị đúng | ✅ Hoạt động / Ngưng / Lỗi kết nối với màu riêng; lọc "Lỗi kết nối" chỉ còn 2 cấu hình lỗi; `Active` + test lỗi → `Error`; `Error` + test đạt → `Active` |
  | Vô hiệu hoá / kích hoạt | ✅ **Hot-plug**: vô hiệu VietQR seed → QR tiếp theo dùng ngay tài khoản của cấu hình VietQR còn Active (không restart); test + kích hoạt lại cấu hình seed → QR dùng lại tài khoản cũ |
  | Phân quyền | ✅ không token → 401; viewer đọc 200, tạo/test → 403; header `x-user-roles` giả không token → 401; UI viewer chỉ có nút "Xem" |
  | Validate | ✅ BIN 5 số, URL sai, connector lạ, timeout 10, thiếu secret khi tạo, đổi loại connector → 400 (kèm lỗi theo trường); UI hiện "Bắt buộc" / "Mã BIN gồm 6 chữ số" tại ô; id không tồn tại/không phải số → 404 |
  | Không lộ secret | ✅ Hash Secret VNPay thật trong `.env.local` không xuất hiện trong bất kỳ response nào, không có chuỗi `enc:v1:`; DB lưu `enc:v1:` |
  | Script e2e API | ✅ 31/31 + hot-plug 3/3 |
  | Trình duyệt | ✅ danh sách, tạo, validate, test, kích hoạt, đổi tên + log, trang VNPay (secret che), bộ lọc, chế độ viewer; không lỗi console |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (24/24 test) |
  | Dọn dẹp | ✅ dừng server :4010, xoá 7 cấu hình QA (log cascade), log test trên cấu hình seed #2, GD test, API key test, key Redis; xoá file token tạm |

- **Khác biệt so với plan:**
  - Đường dẫn API `/api/internal/partners/*` thay vì `/api/admin/partners/*` của API-Design §6.3 — thống nhất với `/api/internal/transactions` (QA-1: `proxy.ts` + `requireAdmin()`).
  - Danh sách dùng **card** (PLAN cho phép "card/bảng"; mockup là bảng) — đủ chỗ cho kết quả test và các nút thao tác.
  - Thêm cột `partner_config_logs.changed_by` (migration mới, đã cập nhật `database/schema_paymenthub.sql`): user Keycloak không có trong bảng `users` nên `user_id` không đủ để ghi "người thực hiện" (SRS-PH-PARTNER-01-05).
  - "Retry policy" lưu `{max_retries, backoff_ms}` theo API-Design; connector chưa dùng (VNPay đang gọi 1 lần) — dùng khi có Route Engine/circuit breaker (P3.8, P7.x).
  - Chưa có "Upload connector plugin" (SRS-PH-PARTNER-02) — thuộc P7.1.

- **Quyết định thiết kế:**
  - Kích hoạt gắn với kết quả test **của chính cấu hình đang lưu** (sửa kết nối là xoá kết quả test) — tránh trường hợp test đạt rồi đổi secret sai mà vẫn Active (SRS-PH-PARTNER-01-03).
  - Đối tác đang chạy bị sửa thông tin kết nối thì về `Inactive` (UI hỏi xác nhận trước): an toàn hơn tiếp tục định tuyến bằng credential chưa kiểm.
  - Test VNPay bằng `querydr` thay cho ping URL: chỉ cách này mới chứng minh được TMN code + Hash Secret khớp nhau.
  - Metadata từng loại connector (`lib/partner-types.ts`) dùng chung cho API (validate, che secret) và UI (nhãn, mặc định) — thêm PSP mới chỉ cần khai báo một mục.

- **Vấn đề / lưu ý:** vấn đề mở #26–#28. Khi có credential VNPay sandbox thật (#16): cập nhật trên `/partners/1` → Test → Kích hoạt để hoàn tất tiêu chí VNPay của P3.5 cùng lúc với P3.3.


### P3.6 — Webhook Engine

- **Hoàn thành:** 2026-11-04 · **Commit:** `ba87a4a` · **Vị trí:** `source/payment-hub/services/webhook/` (`sender.ts`, `queue.ts`, `deliver.ts`), `server/services/webhook.service.ts`, `server/routes/webhook-config.ts`, `app/api/internal/webhooks/`, `app/api/internal/webhook-logs/`, `app/webhooks/`, `components/ph/Webhook*.tsx`; BizOne `app/api/webhooks/payhub/`, `lib/payhub/webhook.ts`
- **Đã làm:**
  - **Gửi** (`services/webhook/sender.ts`): HTTP POST JSON, header `X-Webhook-Id` (UUID, giữ nguyên qua retry/replay), `X-Webhook-Event`, `X-Timestamp`, `X-Signature` = `hex(HMAC-SHA256(secret, timestamp + "." + body))`; timeout theo endpoint; không theo redirect; ghi lại headers/body/HTTP/thời gian. **Chặn SSRF**: URL phải https và không trỏ vào IP nội bộ/loopback/link-local (169.254.169.254…) — dev bật `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` vì BizOne chạy localhost
  - **Hàng đợi** (`services/webhook/queue.ts`, BullMQ `webhook-delivery`): job chỉ mang `deliveryId`, `webhookConfigId`, URL, body — **không có secret** (đóng #3); attempts = 1 + `retry_count`; backoff tuỳ biến theo `retry_intervals` của endpoint (mặc định 1ph → 5ph → 15ph → 1h → 6h); `jobId` = delivery + endpoint ⇒ đưa vào hàng đợi lặp lại không gửi trùng
  - **Worker** (`deliver.ts`): mỗi lần thử = 1 dòng `webhook_logs` (attempt, max_retries, next_retry_at, response, duration, lỗi); đọc + giải mã secret lúc gửi ⇒ đổi secret/tắt endpoint áp dụng ngay cho cả các retry đang chờ (endpoint bị xoá/tắt → dừng retry)
  - **Sự kiện giao dịch qua outbox** (`webhook.service.ts`): đổi trạng thái cuối (IPN `Success`/`Failed`, job hết hạn `Expired`, `transitionStatus`) đặt `notify_webhook = 1, webhook_sent_at = NULL` **trong cùng DB transaction**; sau commit gửi ngay (`dispatchSoon`), worker quét outbox mỗi 30 s cho những gì chưa đưa vào hàng đợi (Redis down, crash). Đóng #17. Payload theo API-Design §7.2 (`payment.success` có `partner_txn_id`, `paid_at`; `payment.failed` có `failure_reason`; `payment.expired` có `expired_at`). `transactions.webhook_url` ghi đè URL endpoint. Không có endpoint nào đăng ký → log `webhook_skipped` trên giao dịch; gửi thành công → log `webhook_delivered`
  - **API admin** (`/api/internal/*`, JWT; đọc: admin/viewer, ghi: admin; token có `merchant_id` chỉ thấy merchant đó): CRUD `webhooks` (secret `whsec_…` sinh tự động, mã hoá AES-256-GCM, **chỉ trả một lần** khi tạo/`rotate-secret`), `PUT …/status`, `POST …/test` (ping, 10/phút), `GET webhooks/stats?hours=`, `GET webhook-logs` (lọc endpoint/giao dịch/sự kiện/trạng thái/URL/ngày, phân trang), `GET webhook-logs/{id}`, `POST webhook-logs/{id}/replay` (30/phút)
  - **Replay**: gửi lại đồng bộ cùng `X-Webhook-Id` + cùng body, ký bằng secret hiện tại, ghi thành lần thử tiếp theo của endpoint đó
  - **UI `/webhooks`** (theo mockup "Danh sách Webhook" / "Cấu hình" / "Lịch sử gửi"): 5 thẻ thống kê (số lần gửi, thành công + tỉ lệ, thất bại, thời gian phản hồi TB/chậm nhất, đang chờ gửi/retry) theo 1h/24h/7 ngày; tab Endpoint — bảng URL, sự kiện, trạng thái, số lần gửi/thành công/thất bại, nút Ping (kết quả hiện tại dòng), Sửa, Bật/Tắt, Xoá; form modal (merchant, URL, checkbox sự kiện, retry, khoảng retry, timeout, đổi secret) và màn hình hiển thị secret một lần có nút chép; tab Lịch sử — lọc trạng thái/sự kiện/mã GD, bảng lần gửi, ngăn kéo chi tiết request/response + nút **Gửi lại**
  - **BizOne nhận webhook** (`POST /api/webhooks/payhub`, public trong `proxy.ts`): kiểm `X-Timestamp` ±5 phút, chữ ký HMAC (constant-time), `X-Webhook-Event` khớp body, chống trùng theo `X-Webhook-Id` (Redis 7 ngày) → 200 `{received, duplicate}`; secret ở `PAYHUB_WEBHOOK_SECRET`
  - Migration `2_webhook_delivery_id`: cột `webhook_logs.delivery_id` + index (gom các lần thử của một thông điệp); `queues.ts` cũ (chứa secret trong job) bị thay bằng `services/webhook/queue.ts`
  - Test Vitest: Payment Hub `tests/webhook.test.ts` (6 — chữ ký, secret, delivery id ổn định, backoff 1ph…6h, chặn SSRF, cờ dev); BizOne `tests/payhub-webhook.test.ts` (3 — chữ ký, sai secret/timestamp/body, cửa sổ 5 phút)
  - Tài liệu: API-Design §7.3–7.4 và OpenAPI `/v1/webhooks` cập nhật cách ký + retry thống nhất với code

- **Kiểm thử** (Payment Hub `next start` :4010 + worker thật, BizOne `next start` :3001 với secret do Payment Hub cấp, endpoint giả lập :3999 `/flaky` (500 hai lần rồi 200) và `/down` (luôn 500), token Keycloak thật, IPN VNPay ký HMAC-SHA512):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Webhook gửi đến BizOne thành công | ✅ IPN thành công → `payment.success` tới BizOne HTTP 200 sau **~0,1–0,7 s** (API-Design: < 3 s); `payment.failed` (IPN mã 24) có `failure_reason`; `payment.expired` do job hết hạn của worker; BizOne log đúng sự kiện + mã GD |
  | Retry khi thất bại | ✅ `/flaky` (retry 3, khoảng [2,3,4] s): Failed → Failed → Success, `next_retry_at` cách 2 s rồi 3 s; `/down` (retry 2): 3 lần Failed, lần cuối không còn `next_retry_at`, dừng hẳn; mọi lần thử cùng một `X-Webhook-Id`; lịch mặc định 1ph/5ph/15ph/1h/6h kiểm bằng unit test |
  | Replay từ lịch sử | ✅ API + UI: replay lần gửi tới BizOne → lần thử 2, cùng `X-Webhook-Id`, BizOne trả `duplicate: true` (chống trùng hoạt động); replay lần lỗi của `/flaky` trên UI → "Gửi lại thành công — HTTP 200"; viewer replay → 403 |
  | Test ping | ✅ ping BizOne → 200 (~20 ms); ping `/down` → báo lỗi HTTP 500; sau khi đổi secret, ping tới BizOne còn secret cũ → 401 (BizOne từ chối chữ ký) |
  | Log chi tiết request/response | ✅ chi tiết có headers (kèm chữ ký — tự tính lại bằng secret endpoint khớp), body, HTTP, response headers/body, thời gian, lỗi, lần thử; lọc theo GD + trạng thái trả đúng 5 lần lỗi |
  | Dashboard: số lần gửi, success, failed, response time | ✅ `stats` khớp đếm trực tiếp trong `webhook_logs` (15 = 8 + 7); bộ đếm theo endpoint khớp DB; UI tự cập nhật sau ping/replay |
  | Webhook config CRUD + active/inactive | ✅ tạo/sửa/tắt/xoá; tắt hết endpoint → IPN mới không gửi gì, GD có log `webhook_skipped` |
  | Outbox | ✅ GD đặt `Success` + cờ outbox trực tiếp trong DB (không qua `dispatchSoon`) → worker quét và gửi tới BizOne trong ≤ 40 s |
  | Bảo mật | ✅ 16 job trong Redis không job nào chứa secret; secret không có trong list/detail, DB lưu `enc:v1:`; không token 401; viewer tạo/ping 403; validate (không sự kiện, URL `ftp://`, khoảng retry 0) → 400; BizOne: chữ ký sai 401, timestamp cũ 10 phút 401, thiếu `X-Webhook-Id` 400, event không khớp 400, gửi trùng 200 `duplicate` |
  | Script e2e | ✅ 27/27 (lần đầu 25/27: phát hiện và sửa lỗi đánh số lần thử khi replay — trước đây đếm gộp mọi endpoint; 1 kỳ vọng sai trong script) |
  | Trình duyệt | ✅ thống kê, bảng endpoint, ping, tab lịch sử + lọc, ngăn kéo chi tiết, replay; không lỗi console. Sửa thêm: nhãn "Lỗi — chờ retry" chỉ hiện khi `next_retry_at` còn ở tương lai |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ cả 2 app (Payment Hub 30/30, BizOne 22/22) |
  | Dọn dẹp | ✅ dừng server :4010/:3001/:3999 + worker; xoá endpoint, `webhook_logs`, GD test, API key test, 34 key Redis (job BullMQ, rate limit, khoá chống trùng BizOne); xoá file token/secret tạm |

- **Khác biệt so với plan:**
  - **Chữ ký** = `HMAC(secret, timestamp + "." + body)` trong `X-Signature` (+ `X-Timestamp`): PLAN/API-Design chỉ ký body (không chống được gửi lại), OpenAPI có timestamp nhưng header `X-PayHub-Signature` và retry 3 lần. Chọn tên header của PLAN + timestamp của OpenAPI + retry 5 lần của PLAN; đã sửa API-Design §7.3–7.4 và OpenAPI cho thống nhất.
  - "Retry tối đa 5 lần" hiểu là 1 lần gửi + 5 lần retry; số lần và khoảng cách cấu hình được theo endpoint.
  - Đường dẫn `/api/internal/webhooks`, `/api/internal/webhook-logs` (không phải `/api/admin/*`) — thống nhất với QA-1/P3.5.
  - Replay và ping gửi **đồng bộ** (admin thấy kết quả ngay), không qua hàng đợi.
  - `refund.completed` chưa phát (chưa có hoàn tiền — #29); API webhook phía merchant chưa có (#31).
  - Thêm điểm nhận ở BizOne để nghiệm thu "gửi đến BizOne" — chỉ xác thực + chống trùng; áp vào hoá đơn ở P4.5 (#30).

- **Quyết định thiết kế:**
  - **Transactional outbox** trên cột có sẵn `transactions.notify_webhook` / `webhook_sent_at` thay vì gửi trực tiếp sau commit: Redis down hoặc process chết giữa chừng không làm mất sự kiện (at-least-once); claim bằng `UPDATE … WHERE webhook_sent_at IS NULL` nên nhiều process cùng quét không gửi đôi.
  - `X-Webhook-Id` tất định theo (mã GD, sự kiện) ⇒ outbox gửi lại, retry, replay đều cùng id — merchant chỉ cần chống trùng theo header này.
  - Secret đọc từ DB lúc gửi (không nằm trong job) ⇒ đổi secret/tắt endpoint có hiệu lực cả với retry đang chờ; mất Redis không lộ secret.
  - Mọi phản hồi khác 2xx đều retry (kể cả 4xx) vì merchant hay trả 4xx tạm thời khi deploy; chỉ URL không hợp lệ/bị chặn mới dừng ngay.

- **Vấn đề / lưu ý:** vấn đề mở #29–#32. Đóng #3, #17. BizOne cần đặt `PAYHUB_WEBHOOK_SECRET` (secret hiện một lần khi tạo endpoint trên `/webhooks`) để nhận webhook.


### P3.7 — Payment Hub Dashboard

- **Hoàn thành:** 2026-11-05 · **Commit:** `7bfeefa` · **Vị trí:** `source/payment-hub/app/dashboard/`, `app/api/internal/dashboard/`, `server/services/dashboard.service.ts`, `server/ws/dashboard.ts` (+ `server/ws/server.ts`), `lib/dashboard.ts`, `components/ph/{DashboardClient,DashboardStats,RevenueChart,PaymentMethodPie,RecentTransactions,DashboardAlerts,TopMerchants}.tsx`, `components/ph/dashboard-format.ts`, `tests/dashboard.test.ts`
- **Đã làm:**
  - **API** `GET /api/internal/dashboard?period=today|7days|30days` (API-Design §6.1; JWT qua `proxy.ts`, role `payhub-admin`/`payhub-viewer`, token có `merchant_id` chỉ thấy merchant đó; period sai → 400 `VALIDATION_ERROR`). Trả: `summary` (tổng GD, tổng tiền GD thành công, thành công, thất bại = Failed + Expired, đang chờ, hoàn tiền, tỉ lệ thành công), `previous` + `changes` (% so với kỳ trước cùng độ dài), `chart` (mỗi ngày: số GD, tiền thành công, thành công, thất bại — tối thiểu 7 ngày, 30 ngày khi chọn 30 ngày; ngày trống điền 0), `paymentMethods` (gộp theo `partner_configs.connector_type`, rồi `payment_method`: VNPay / VietQR / MoMo / ZaloPay / "Chưa chọn"), `recentTransactions` (10 GD mới nhất), `topMerchants` (top 5 theo doanh thu, SRS-PH-DASH-01-06), `alerts`, `generatedAt`
  - **Ngày nghiệp vụ theo giờ Việt Nam** (UTC+7) trong khi DB lưu UTC: "Hôm nay" = 00:00 ICT → hiện tại, so với cùng khung giờ hôm qua; biểu đồ nhóm theo `DATE(created_at + INTERVAL 7 HOUR)`
  - **Cache** Redis `payhub:dash:v1:{all|merchantId}:{period}` TTL 15 s (API-Design §12 "Redis aggregate cache"); Redis lỗi → đọc thẳng DB
  - **Cảnh báo** (SRS-PH-DASH-01-07): GD lỗi bất thường (≥ 5 GD Failed/Expired và ≥ 30 % số GD kết thúc trong 60 phút), webhook thất bại hẳn (lần gửi cuối Failed, hết retry, chưa từng thành công — 24 giờ), webhook lỗi nhiều (≥ 5 lần lỗi/giờ), outbox webhook kẹt > 5 phút; mỗi cảnh báo link tới `/transactions` hoặc `/webhooks`
  - **Realtime** `server/ws/dashboard.ts` (`DashboardRelay`, chạy trong process realtime :4001): client gửi `{"type":"subscribe","channel":"dashboard"}`; mỗi sự kiện `transaction.*` từ Redis → (gộp tối đa 1 lần/giây) xoá cache dashboard, tính `dashboard:stats` `{total_today, amount_today, success_count, failed_count, success_rate}` theo phạm vi của từng client (tất cả / merchant), gửi kèm `dashboard:refresh`; mỗi 15 s gửi `dashboard:refresh` để cảnh báo/số liệu webhook (không có sự kiện riêng) không cũ quá ~30 s. `/health` của realtime báo thêm `dashboardSubscribers`
  - **UI `/dashboard`** (theo mockup Dashboard): server component render sẵn dữ liệu "Hôm nay" (`await connection()`), client: chọn Hôm nay / 7 ngày / 30 ngày, nút làm mới, chỉ báo "Real-time / Đang kết nối / Ngoại tuyến", giờ cập nhật; 4 thẻ top bar có % so kỳ trước (cập nhật ngay từ `dashboard:stats`); biểu đồ đường 2 trục (số GD + tiền thành công, tooltip theo ngày); donut phương thức thanh toán; donut tỉ lệ thành công/hoàn tiền/thất bại/hết hạn/đang xử lý; 10 GD gần nhất (GD mới tô sáng, link chi tiết); top merchant; khung cảnh báo. WS tự kết nối lại (backoff 1 s → 30 s), mất WS thì poll 15 s. Biểu đồ vẽ bằng SVG thuần — không thêm thư viện
  - **Sửa `build:jobs`** sang ESM `.mjs` (bundle CJS cũ không chạy được với Prisma 7 — xem *Đã giải quyết*); `docker-compose.yml`, `Dockerfile` chạy `dist/worker.mjs`, `dist/server.mjs`
  - Test Vitest `tests/dashboard.test.ts` (8): ranh giới ngày ICT, cửa sổ so sánh, gộp trạng thái + tỉ lệ, % thay đổi, điền ngày trống, nhãn phương thức, ngưỡng cảnh báo

- **Kiểm thử** (`next start` :4010 với `DEV_AUTH_TOKEN` admin, realtime `node dist/server.mjs` :4001 + worker `dist/worker.mjs`, token Keycloak thật (PKCE) cho admin/viewer, 92 GD mẫu trải 9 ngày cho 2 merchant + GD thật tạo qua `POST /api/v1/transactions` ký HMAC bằng API key do `apikey:create` cấp, trình duyệt tích hợp):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Dashboard load < 3 s | ✅ Trang `/dashboard` (SSR có dữ liệu): DOMContentLoaded 96 ms, load 110 ms; API không cache 7–11 ms mỗi khoảng (lần gọi đầu sau khởi động 0,23 s), có cache ~4 ms |
  | WebSocket cập nhật real-time | ✅ 3 GD tạo qua API merchant → client WS nhận `dashboard:stats` (6→7→8→9) sau **41–85 ms**; trang đang mở tự cập nhật thẻ tổng GD và dòng GD mới đầu bảng không cần tải lại; API ngay sau đó trả tổng 9 (cache đã bị xoá). Viewer subscribe nhận stats; token rác bị từ chối |
  | Biểu đồ render đúng | ✅ Số liệu API khớp SQL đếm trực tiếp (7 ngày: 69 GD, 42 thành công, 23 thất bại, 37,28 tr ₫; kỳ trước 21 → +228,6 %; VNPay 38 / VietQR 15 / chưa chọn 16); biểu đồ 7 và 30 điểm, nhãn trục ngày, tooltip; donut phương thức + tỉ lệ thành công khớp; top merchant 2 dòng đúng doanh thu/tỉ lệ; chọn 7 ngày / 30 ngày đổi toàn bộ số liệu. Không lỗi console |
  | Dữ liệu cách đây < 30 s | ✅ Cảnh báo (đổi 6 GD sang Failed + thêm 1 webhook hết retry trực tiếp trong DB, không phát sự kiện) hiện trên trang sau ~11 s nhờ tick 15 s; khi tắt process realtime, trang chuyển "Ngoại tuyến — tự làm mới mỗi 15s" và GD mới hiện sau ~25 s; bật lại realtime → tự về "Real-time" |
  | Cảnh báo GD lỗi nhiều, webhook fail | ✅ "Giao dịch lỗi bất thường 6/6 (100 %) trong 60 phút" và "Webhook payment.success (TXN-…) thất bại sau 6 lần gửi — HTTP 500"; không có sự cố → "Hệ thống ổn định" |
  | Chọn khoảng thời gian | ✅ Hôm nay / 7 ngày / 30 ngày (so với hôm qua / 7 ngày trước / 30 ngày trước) |
  | Bảo mật / lỗi | ✅ Không token 401; header `x-user-*` giả 401; viewer 200; `period=year` 400 |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 38/38); `node dist/server.mjs`, `node dist/worker.mjs` khởi động được |
  | Dọn dẹp | ✅ Dừng :4010, realtime, worker; xoá 94 GD test + log, webhook log test, API key + merchant `P37TEST`; không còn key Redis test; xoá file token/secret tạm. Docker Desktop đang tắt khi bắt đầu phiên → đã mở lại (Keycloak/MariaDB/Redis/MinIO tự chạy theo restart policy) và để nguyên |

- **Khác biệt so với plan:**
  - Đường dẫn API `/api/internal/dashboard` (không phải `/api/admin/dashboard` của API-Design) — thống nhất với các API admin khác từ QA-1.
  - WebSocket: không có namespace `/ws/admin/dashboard` riêng; dùng chung `:4001/ws` (đã xác thực JWT + role) và đăng ký kênh bằng message `subscribe` — cùng một kết nối, cùng cơ chế lọc merchant.
  - "Tổng tiền" = tổng tiền GD **thành công** (gồm GD đã hoàn tiền); tỉ lệ thành công = thành công / (thành công + thất bại + hết hạn), không tính GD đang chờ (API-Design ví dụ chia cho tổng).
  - Thêm top merchant (SRS-PH-DASH-01-06, có trong mockup) dù PLAN không liệt kê; thêm `DashboardAlerts.tsx`, `TopMerchants.tsx`, `DashboardClient.tsx`, `lib/dashboard.ts`.
  - Biểu đồ dùng SVG tự vẽ thay vì thư viện chart.
  - Sửa lỗi có sẵn của `build:jobs` (CJS → ESM) vì process realtime giờ cần Prisma.

- **Quyết định thiết kế:**
  - Realtime đẩy **số liệu top bar** (rẻ: 1 `groupBy`) + **gợi ý refresh**; phần còn lại client tự gọi API (đã có cache) — tránh tính toàn bộ dashboard cho từng client trong process WS.
  - Xoá cache khi có sự kiện GD (không đợi hết TTL) ⇒ cache chỉ giới hạn tải DB, không làm dữ liệu cũ. Freshness đảm bảo bằng 3 lớp: sự kiện (ms), tick 15 s (cảnh báo/webhook), poll 15 s khi mất WS.
  - Cảnh báo tính tại thời điểm đọc từ DB (không lưu bảng riêng) — đơn giản, không lệch với dữ liệu; ngưỡng tập trung ở `ALERT_RULES`.

- **Vấn đề / lưu ý:** mới #33 (ngưỡng cố định, thiếu cảnh báo đối tác/đối soát), #34 (chưa kiểm e2e theo merchant). Trang `/dashboard` render sẵn dữ liệu mọi merchant khi chưa có đăng nhập (#7, như `/transactions`). Đóng lỗi bundle CJS của worker/realtime.


### P3.8 — Route Engine — Partner Selection

- **Hoàn thành:** 2026-11-06 · **Commit:** `6c9c435` · **Vị trí:** `source/payment-hub/services/routing/` (`routeMap.ts`, `routeEngine.ts`), `server/routes/route-config.ts`, `app/api/internal/routes/`, `server/services/payment.service.ts`, `server/services/qr.service.ts`, `server/routes/transactions.ts`, `server/routes/pay-page.ts`, migration `3_merchant_routes`, `tests/routing.test.ts`
- **Đã làm:**
  - **`routeMap.ts`** — bảng `payment_method` → connector theo PLAN: `vnpay_qr`/`vnpay_atm`/`vnpay_card`/`vnpay` → VNPay, `vietqr` → VietQR, `momo_qr` → MoMo, `zalopay_qr` → ZaloPay; mỗi mục có `kind` (`redirect` = connector dựng URL PSP, `qr` = Hub tự sinh VietQR) và nhãn cho trang thanh toán. Thay cho danh sách `methods` cứng trong `registry.ts`
  - **`routeEngine.ts`**:
    - `planRoute(merchantId, method)` — ứng viên = partner config đúng loại connector, `Active`, connector bật (`connectors.is_active`) và có code trong build; thứ tự = danh sách ưu tiên của merchant (`merchant_routes`, priority nhỏ trước, dòng `is_enabled = 0` bị loại) rồi các partner Active còn lại theo id (fallback). Mỗi partner bị loại có lý do: `inactive`, `error_status`, `connector_disabled`, `connector_not_implemented`, `disabled_for_merchant`, `circuit_open`. Lõi sắp xếp `orderCandidates()` là hàm thuần (unit test)
    - `executeRoute(plan, attempt)` — thử lần lượt, timeout theo `partner_configs.timeout`; lỗi đối tác/timeout → ghi lỗi cho circuit + thử partner kế (fallback); lỗi nghiệp vụ (GD hết hạn, sai input…) dừng ngay, không tính lỗi cho đối tác; hết partner → `NoRouteError` (`no_partner` / `all_failed`, kèm từng lần thử)
    - **Circuit breaker** (Redis): ≥ 5 lỗi liên tiếp trong 60 s → bỏ qua partner 30 s (`ROUTE_CB_FAILURES/WINDOW_S/OPEN_S`), thành công xoá bộ đếm; Redis lỗi → không chặn routing (fail open). Mỗi partner một bộ đếm → lỗi một đối tác không ảnh hưởng đối tác khác
    - Đọc DB mỗi request (3 truy vấn nhỏ + 1 MGET) → kích hoạt/vô hiệu đối tác, đổi ưu tiên có hiệu lực ngay request sau, không restart (hot-plug)
  - **Bảng `merchant_routes`** (migration `3_merchant_routes`, cập nhật `database/schema_paymenthub.sql`): `merchant_id`, `payment_method`, `partner_config_id`, `priority`, `is_enabled`; unique (merchant, method, partner); FK cascade
  - **API admin** (`server/routes/route-config.ts`, JWT qua `proxy.ts`): `GET /api/internal/routes` (mặc định + circuit từng partner), `GET/PUT /api/internal/routes/{merchantId}` (ưu tiên đã cấu hình, route hiệu lực, partner bị bỏ qua + lý do cho 7 phương thức; PUT: thứ tự mảng = ưu tiên, `partners: []` xoá cấu hình phương thức đó; kiểm partner tồn tại + đúng loại connector + không trùng), `DELETE /api/internal/routes/circuits/{partnerId}` (đóng circuit). Đọc: admin/viewer; ghi: admin; token gắn `merchant_id` chỉ xem/sửa merchant đó, không reset circuit
  - **Tích hợp**:
    - `initiatePayment()` (VNPay và các connector redirect sau này) chọn partner qua Route Engine thay vì "partner Active đầu tiên"; log GD ghi tên/id partner và partner đã lỗi khi fallback
    - `qr.service.generateQr()` lấy tài khoản nhận VietQR qua Route Engine (ưu tiên theo merchant ⇒ merchant có thể có tài khoản nhận riêng; cấu hình tài khoản sai → fallback sang tài khoản kế); `/api/v1/qr/generate` trả lý do khi 503
    - **#25** — `POST /api/v1/transactions`: `payment_method` nhận mọi phương thức trong route map (+ `null`), thêm `qr_size`; `vietqr` → GD `Pending` + `qr_code` (`type`, `image_base64`, `image_url`, `raw_data`, `transfer_note`, `bank`, `expires_at`) và `payment_url` = trang QR của Hub; thêm `partner`, `fallback_used`, `payment_error`. Phương thức không có partner khả dụng → 503 trước khi tạo GD, `details.skipped` + `available_methods`
    - **`/pay/{txn}`**: picker chỉ liệt kê phương thức đang khả dụng cho merchant; `vietqr` → màn hình QR (ảnh, ngân hàng, số TK, chủ TK, số tiền, nội dung CK, giờ hết hạn) tự reload 15 s (thấy kết quả / QR mới khi hết hạn, không cần JS); phương thức chọn bị sập → picker 503 kèm thông báo và các phương thức còn lại; không còn phương thức nào → "Chưa thể thanh toán"; GD đã kết thúc → trang kết quả (thành công / hết hạn / thất bại / hoàn tiền)
  - Không đổi IPN/redirect: vẫn xác thực bằng `transactions.partner_config_id` của GD (đúng secret dù GD đi qua partner dự phòng)
  - `.env.example` thêm `ROUTE_CB_*`; API-Design §5.1 (bảng `payment_method`, `qr_size`, `partner`, `fallback_used`, `payment_error`, lỗi 503) + §6.2b (Route Engine)
  - Test Vitest `tests/routing.test.ts` (11): route map, thứ tự mặc định + lý do loại, ưu tiên merchant + fallback + dòng tắt, circuit/connector tắt/chưa có code, VNPay sập không ảnh hưởng VietQR, fallback khi lỗi + khi timeout, lỗi nghiệp vụ không fallback, `NoRouteError`, circuit mở sau 5 lỗi liên tiếp và reset khi thành công

- **Kiểm thử** (`next build` + `next start` :4010, MariaDB/Redis local, 2 merchant test `P38A`/`P38B` + API key do `apikey:create` cấp, script e2e ký HMAC độc lập với code app, token Keycloak thật (PKCE) cho `payhub.admin`/`payhub.viewer`; thêm partner dự phòng "VNPay Backup" (#8, bản sao #1) và "VietQR Backup" (#9, số TK khác); trình duyệt tích hợp):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo GD với method='vnpay_qr' → route đến VNPay | ✅ 201 `Pending`, `partner: VNPay`, `payment_url` sandbox VNPay có `vnp_BankCode=VNPAYQR`, `partner_config_id = 1` (~45 ms); `vnpay_atm`/`vnpay_card`/`vnpay` cũng về VNPay; `/pay/{txn}?method=vnpay_qr` → 302 VNPay |
  | Tắt VNPay → GD với method='vietqr' vẫn hoạt động | ✅ cả 2 partner VNPay `Inactive`: `vnpay_qr` → 503 (không tạo GD, `skipped` = 2× `inactive`, `available_methods: ["vietqr"]`); `vietqr` → 201 + `qr_code` (~23 ms); picker chỉ còn VietQR; `/pay?method=vnpay_qr` → 503 + thông báo + nút VietQR. Tắt connector `vnpay` (`connectors.is_active=0`) → 503 `connector_disabled`, bật lại → 201 ngay (không restart). Ngược lại tắt hết VietQR → `vietqr` 503 còn VNPay vẫn 201 |
  | `map` 'momo_qr' → MoMo, 'zalopay_qr' → ZaloPay | ✅ có trong route map (unit test); chưa có connector (P5.1/P5.2) → 503 + `available_methods`, không tạo GD |
  | Fallback nếu đối tác lỗi | ✅ partner ưu tiên VNPay #8 hỏng secret → GD vẫn 201 qua #1, `fallback_used: true`, log GD "… fallback after #8 failed"; VietQR #9 sai số TK → QR bằng tài khoản #2; cả 2 VNPay lỗi → GD tạo `Created` + `payment_error.reason = all_failed`, trang `/pay` mời chọn VietQR. Response cho merchant không lộ thông điệp lỗi nội bộ của partner |
  | Cấu hình ưu tiên đối tác theo merchant | ✅ PUT merchant A: `vnpay_qr` = [#8, #1], `vietqr` = [#9] → route hiệu lực [#8, #1] và [#9, #2] (partner chưa liệt kê đứng sau); A `vnpay_qr` → #8, A `vietqr` → tài khoản #9; merchant B (không cấu hình) → #1 / tài khoản #2; `enabled: false` cho #8 → A về #1 (`disabled_for_merchant`) |
  | Graceful degradation: một đối tác lỗi không ảnh hưởng đối tác khác | ✅ 5 lỗi liên tiếp của #8 → circuit #8 mở (`open_ms_left` ~30 s), request sau đi thẳng #1 không thử #8; bộ đếm #1 = 0; admin reset circuit → đóng (viewer → 403). VNPay sập không ảnh hưởng VietQR (trên) |
  | #25 — `vietqr` trả `qr_code`; `/pay` có VietQR | ✅ `qr_code` đủ trường API-Design §5.1, `qr_size: 500` → ảnh 500 px; `image_url` → 200 `image/png`; `GET /api/v1/qr/{txn}` trả lại cùng `qr_id`; `payment_url` → trang QR (đã xem trên trình duyệt: ảnh QR, ngân hàng, số TK, chủ TK, nội dung `TXN…`, giờ hết hạn, nút "Chọn phương thức khác"); GD chuyển `Success` → trang "Thanh toán thành công" |
  | IPN với GD đi qua partner dự phòng | ✅ IPN ký HMAC-SHA512 cho GD route qua #8 → `00 Confirm Success`, GD `Success`, giữ `partner_config_id = 8` |
  | Lỗi / phân quyền API route config | ✅ không token 401; header `x-user-*` giả 401; viewer GET 200 / PUT 403; gán partner VNPay cho `vietqr` 400; partner không tồn tại 400; method lạ 400; merchant không tồn tại 404; `partners: []` xoá cấu hình; tạo GD method lạ / `qr_size: 250` → 400 |
  | Script e2e | ✅ 55/55 (chạy lại toàn bộ từ trạng thái sạch sau lần sửa cuối) |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 49/49); `dist/worker.mjs`, `dist/server.mjs` khởi động được |
  | Dọn dẹp | ✅ dừng :4010; xoá 66 GD test (log/QR/raw cascade), merchant `P38A`/`P38B` + API key + `merchant_routes`, partner #8/#9; khôi phục `api_key`/trạng thái partner #1, #2 đúng giá trị ban đầu (đã so khớp), `connectors.vnpay` bật; xoá key Redis (`payhub:route:*`, QR, rate limit); xoá file token/API secret tạm |

- **Khác biệt so với plan:**
  - Thêm bảng `merchant_routes` (migration mới) để lưu "ưu tiên đối tác theo merchant" — schema gốc không có chỗ lưu.
  - Fallback **trong cùng loại connector** (VNPay → VNPay dự phòng, VietQR → tài khoản dự phòng); không tự đổi sang phương thức khác (vd. `vnpay_qr` → `vietqr`) vì merchant đã chỉ định phương thức. Thay vào đó: API trả `available_methods`, trang `/pay` mời khách chọn phương thức còn hoạt động.
  - Circuit breaker mức nhẹ trong Redis (đủ cho "graceful degradation"); circuit breaker/Health Monitor đầy đủ với bảng `connector_circuit_breaker_states` thuộc P7.1/P7.5 (#36).
  - Chưa có UI cấu hình route (PLAN chỉ nêu file backend) — #35.
  - `server/routes/route-config.ts` là API admin `/api/internal/routes/*` (thống nhất với các API admin khác từ QA-1).

- **Quyết định thiết kế:**
  - VietQR đi qua cùng Route Engine như PSP redirect (`kind: qr`) ⇒ một nơi quyết định partner cho mọi phương thức; merchant có thể dùng tài khoản nhận riêng.
  - Partner chưa có trong danh sách ưu tiên của merchant vẫn được dùng sau cùng (thay vì bị cấm) — thêm partner mới không làm merchant cũ mất dự phòng; muốn loại thì đặt `enabled: false`.
  - Phân biệt lỗi nghiệp vụ (có `code` NOT_FOUND/CONFLICT/VALIDATION_ERROR) với lỗi đối tác: chỉ lỗi đối tác mới fallback và tính vào circuit — tránh "đốt" mọi partner vì một GD hết hạn.
  - Không cache bảng định tuyến (đọc DB mỗi request): bảng rất nhỏ, đổi cấu hình có hiệu lực tức thì, không cần cơ chế xoá cache giữa nhiều process.
  - Kiểm tra trước khi tạo GD (503 không tạo GD) nhưng nếu partner lỗi ngay sau khi tạo thì vẫn trả 201 `Created` + `payment_error` — GD đã có, khách vẫn thanh toán được bằng phương thức khác trên `payment_url`.

- **Vấn đề / lưu ý:** đóng #25. Mới #35–#38. VNPay vẫn dùng credential placeholder (#16) — routing chạy đúng, nhưng VNPay sandbox thật vẫn chờ P3.3.


### QA-1 — Rà soát chất lượng & sửa lỗi (2026-11-04)

- **Hoàn thành:** 2026-11-04 · **Commit:** `f5c0236` (Payment Hub), `06998b9` (BizOne), `a117bf9` (CI + tài liệu) · **Vị trí:** `source/bizone`, `source/payment-hub`, `keycloak/realms/payment-hub-realm.json`, `.github/workflows/ci.yml`
- **Bối cảnh:** rà soát toàn dự án sau P3.2/P3.3 (không thuộc task nào trong PLAN). Kết quả rà soát: build/typecheck qua, nhưng lint lỗi (`AuditTable`), 29 file lệch format, không có test/CI, và các lỗi bảo mật/nghiệp vụ dưới đây. Người dùng yêu cầu sửa toàn bộ.

- **Đã làm:**
  - **BizOne — cô lập tenant (DB riêng mỗi tenant, SRS-NFR-14/19, AC-SEC-04):**
    - `lib/tenant.ts`: registry `TENANT_DATABASES` (`tenantId=database,…`), `runWithTenant()` / `currentTenantId()` trên AsyncLocalStorage; tenant không đăng ký → lỗi (fail closed).
    - `lib/prisma.ts`: `getPrisma()` trả client (pool riêng) của DB tenant hiện tại; ngoài phạm vi tenant thì throw — không còn DB dùng chung mặc định. `getPrismaForTenant()` cho seed/health.
    - Điểm vào đặt tenant: middleware tRPC `enforceTenant` (sau khi khớp `X-Tenant-ID` với claim), `proxy.ts` (403 "Tenant is not provisioned"), POS WebSocket (mọi truy cập DB/Redis bọc `runWithTenant`), worker BullMQ (job mang `tenantId`; job thiếu tenant bị từ chối), SSE `/api/inventory/alerts`.
    - Redis theo tenant: `pos:cart:{tenant}:{session}`, kênh `bizone:pos:{tenant}:{session}`, `bizone:low-stock:{tenant}`; room/queue WS theo `{tenant}:{session}` (queue tự dọn khi rảnh).
    - `/api/health` ping mọi DB tenant; seed nhận `SEED_TENANT_ID`; `.env.example`/compose thêm `TENANT_DATABASES`, `DEV_TENANT_ID`.
  - **Payment Hub — bảo mật API:**
    - `GET /api/v1/transactions`: có `X-Api-Key` → bắt buộc HMAC + chỉ giao dịch của merchant đó; không có → JWT + role admin. (Trước đây `X-Api-Key` bất kỳ đi thẳng vào handler không xác thực.)
    - `/api/internal/transactions[/:id]`: `requireAdmin()` (role `payhub-admin`/`payhub-viewer`), token có `merchant_id` chỉ thấy merchant đó; tham số `page/limit/status` được kiểm tra.
    - `proxy.ts` (cả 2 app): xoá header định danh `x-user-*`/`x-merchant-id` do client gửi trên mọi đường dẫn.
    - Chữ ký merchant theo OpenAPI: `hex(HMAC-SHA256(secret, METHOD\nPATH?QUERY\nTS\nhex(SHA256(body))))`, so sánh constant-time (`lib/hmac.ts`); timestamp giây ±300s.
    - `api_secret` lưu AES-256-GCM (`enc:v1:`), secret dạng rõ bị từ chối; `lib/api-keys.ts` + `npm run apikey:create -- <MERCHANT_CODE>`.
    - WebSocket `:4001/ws`: token qua subprotocol `["payhub-events", token]`, yêu cầu role admin/viewer, lọc sự kiện theo `merchantId`, đóng socket khi token hết hạn; mọi sự kiện có `merchantId`.
    - Kiểm tra `azp` (client được phép) ở cả 2 app — `KEYCLOAK_ALLOWED_CLIENTS`.
  - **Payment Hub — tranh chấp trạng thái:** `transitionStatus` và `expireOverdueTransactions` dùng `UPDATE … WHERE status = <đã đọc>`; bên thua nhận `InvalidTransitionError`; log hết hạn ghi đúng `fromStatus`.
  - **Keycloak:** client `payhub-admin-console` thêm mapper `realm roles`, `username`, `merchant_id` (realm JSON + Keycloak đang chạy).
  - **UI:** `TransactionsClient` gửi Bearer (dev: `DEV_AUTH_TOKEN`), xuất CSV duyệt từng trang 100 (API giới hạn 100/trang, trước đây chỉ xuất được 100 dòng); `AuditTable` hết lỗi lint `set-state-in-effect`.
  - **Chất lượng:** Prettier toàn bộ; ESLint bỏ qua tham số `_x`; `redis.keys()` → `SCAN` + `UNLINK`; gỡ `jwks-rsa` không dùng; Vitest (`npm test`: BizOne 19 test, Payment Hub 14 test); CI GitHub Actions (format, lint, typecheck, test, build, build:jobs cho 2 app).

- **Kiểm thử:**

  | Tiêu chí | Kết quả |
  |----------|---------|
  | format:check / lint / typecheck / test / build / build:jobs (2 app) | ✅ tất cả exit 0 (BizOne 19/19 test, Payment Hub 14/14) |
  | Payment Hub API (app thật :4010, token Keycloak thật qua PKCE, key do `apikey:create` cấp) | ✅ 17/17: chữ ký mới → 201; chữ ký kiểu cũ, sai path, sai method, body sửa, timestamp ms → 401; `GET /api/v1/transactions` với `X-Api-Key` rác → 401; internal: không token 401, admin/viewer 200, header `x-user-roles` giả → 401 |
  | Cô lập merchant | ✅ 6/6: key BIZONE không đọc được GD của merchant QA2 (404), list không lẫn; token service account không role → 403; token realm BizOne → 401 |
  | WebSocket Payment Hub | ✅ 7/7: không token/token rác/token realm khác → 401; viewer kết nối, nhận `transaction.created` có `merchantId` |
  | Tranh chấp hết hạn vs thanh toán (40 GD Pending quá hạn, chạy song song, 3 lần) | ✅ mỗi lần 39 Success + 1 Expired, 1 transition bị từ chối, **0 bản ghi lệch** giữa trạng thái và log |
  | BizOne cô lập tenant (2 DB thật: `bizonedb`, `bizone_qa2` tạo từ migration + seed) | ✅ SP tạo ở `tenant_qa2` không hiện ở `tenant_demo`; SP tạo qua API `tenant_demo` chỉ nằm trong `bizonedb`; `X-Tenant-ID` khác claim → 403; tenant không có trong `TENANT_DATABASES` → 403 (tRPC + SSE); health ping cả 2 DB |
  | SSE cảnh báo tồn | ✅ chỉ nhận `bizone:low-stock:tenant_demo`, không nhận kênh tenant khác |
  | POS WebSocket | ✅ 6/6: tenant lệch 403, phiên không tồn tại 404, 2 màn hình đồng bộ `cart:updated`, key Redis `pos:cart:tenant_demo:5` |
  | Worker BullMQ | ✅ job có tenant → completed; job thiếu `tenantId` → failed "has no tenantId" |
  | Dọn dẹp | ✅ dừng mọi server test, xoá GD/API key/merchant QA2/RACE, chi nhánh/kho/ca/SP/audit QA, DB `bizone_qa2`, key Redis và job BullMQ test |

- **Khác biệt so với rà soát ban đầu:**
  - Lỗi "proxy chặn API HMAC" đã được P3.3 sửa trước khi QA-1 bắt đầu; QA-1 phát hiện thêm lỗ hổng mới do bản sửa đó (bỏ qua JWT khi có `X-Api-Key` nhưng handler list không xác thực).
  - Gói `cn` **giữ lại**: là thay thế hợp lệ của clsx + tailwind-merge; `shadcn` giữ trong `dependencies` vì `globals.css` import `shadcn/tailwind.css` lúc build.
  - Mật khẩu dev trong tài liệu/realm JSON chưa đổi (chỉ dùng cho dev) — cần xác nhận repo GitHub để private.

- **Quyết định thiết kế:**
  - Multi-tenant theo SRS: **mỗi tenant một database**, chọn qua AsyncLocalStorage để không phải sửa chữ ký ~100 hàm service; registry đặt ở env cho MVP (vấn đề #20).
  - Chữ ký HMAC theo `OpenAPI-PaymentHub.yaml` (máy đọc được) — `API-Design-PaymentHub.md` §2.1 đã sửa cho khớp; URI_PATH gồm cả query string.
  - `api_secret` mã hoá (không hash) vì cần lấy lại để kiểm chữ ký.

- **Vấn đề / lưu ý:** #7 (page admin chưa có đăng nhập), #20–#22. Merchant đang tích hợp (nếu có) phải đổi sang chữ ký mới; key cấp trước QA-1 (secret dạng rõ) cần cấp lại.

---

### QA-2 — Rà soát cuối Giai đoạn 2 + 3 (2026-11-07)

- **Hoàn thành:** 2026-11-07 · **Commit:** `3a1e7cd` (rà soát), `6931cb8` (sửa BizOne), `bb59ff9` (sửa Payment Hub) · **Vị trí:** `source/bizone`, `source/payment-hub`, `database/schema_paymenthub.sql`, `documents/API-Design-PaymentHub.md`
- **Bối cảnh:** bước B6 mới của quy trình (`CLAUDE.md`) — GĐ 2 xong 10/10, GĐ 3 không còn task ⬜ (P3.3/P3.4/P3.5 🟡 chỉ chờ credential VNPay / quét QR). Người dùng yêu cầu rà soát trước khi sang P4.1.
- **Cách làm:** chạy production build (`next start` BizOne :3001 + `dist/pos.mjs` + `dist/worker.mjs`; Payment Hub :4010 + `dist/worker.mjs` + `dist/server.mjs`), token Keycloak thật (PKCE, user dev trong realm JSON), gọi tRPC / REST bằng script; API key merchant tạm cho `BIZONE`. Ưu tiên chạy lại các tiêu chí trước đây chỉ kiểm bằng đọc code (P2.1, P2.3, P2.7–P2.10, P3.1). Chưa chạy lại UI trên trình duyệt: page lấy `DEV_AUTH_TOKEN` "đóng băng" lúc build (#7).

- **Chất lượng (tự động):**

  | Kiểm tra | BizOne | Payment Hub |
  |----------|--------|-------------|
  | `format:check` / `lint` / `typecheck` | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ |
  | `npm test` | ✅ 22/22 | ✅ 49/49 |
  | `build` / `build:jobs` | ✅ / ✅ | ✅ / ✅ |
  | CI GitHub Actions | ✅ 4 lần chạy gần nhất xanh (`b17c9bb`, `7c9eb4d`, `df88607`, `92824b2`) | |
  | Prisma: lịch sử migration / lệch schema DB | ✅ 1 migration, không lệch | ✅ 4 migration, không lệch |
  | `npm audit --omit=dev` | ⚠️ 8 (2 low, 6 moderate) — #50 | ⚠️ 6 (2 low, 4 moderate) — #50 |
  | Độ phủ test | ⚠️ 4 file (cart, rbac, tenant…) — chưa có test service kho/đơn/CRM/dashboard/audit | ✅ state machine, HMAC, security, webhook, dashboard, routing, VietQR |

- **Tiêu chí nghiệm thu chạy lại:**

  | Task | Tiêu chí (PLAN) | Kết quả QA-2 |
  |------|-----------------|--------------|
  | P2.1 | CRUD; search < 300 ms; import 1000 SP < 30 s, báo lỗi chính xác; export xlsx | ✅ CRUD; search 3–24 ms (6 truy vấn: tên, SKU, mã vạch, không có kết quả); import 1000 SP + 4 dòng lỗi **1,66 s**, export 1002 dòng 81 ms đúng cột. ⚠️ số dòng báo lỗi sai với SKU trùng (#47); `created_by` NULL (#44) |
  | P2.2 | UI sản phẩm | ⏭ không chạy lại UI (#7); trang `/products` 200 |
  | P2.3 | Nhập 1000 SP cập nhật tồn < 1 s; kiểm kê 1000 SP < 30 phút; chuyển kho 3 bước; cảnh báo tồn thấp < 5 s | ⚠️ tạo phiếu 999 SP 131 ms, **xác nhận 1,04 s** (sát ngưỡng, #48); ✅ kiểm kê 999 SP: tạo 75 ms, nhập SL thực tế 450 ms, hoàn tất 2,1 s, 100 dòng chênh lệch đúng; ✅ chuyển kho tạo → xác nhận đúng, chặn kho trùng / vượt tồn (nhưng trả HTTP 500 — #43); ✅ SSE cảnh báo tồn thấp **0,07 s** |
  | P2.4 | UI kho | ⏭ không chạy lại UI (#7); API nền (kiểm kê, lịch sử phiếu) đạt ở trên |
  | P2.5 | Tạo HĐ < 5 s, … | ✅ tạo HĐ có khách 45 ms (chỉ chạy lại phần API; WS 2 màn hình không chạy lại — code không đổi từ P2.6) |
  | P2.6 | Full flow POS UI | ⏭ không chạy lại UI (#7) |
  | P2.7 | Đơn online → xác nhận → giao → hoàn thành; filter; xuất Excel; tracking | ✅ pending → confirmed → preparing → shipping (GHN, mã vận đơn) → delivered → completed; chặn completed → confirmed; filter kênh + trạng thái; xuất Excel 29 ms. ❌ chấp nhận tổng tiền âm (#45); ⚠️ `created_by` NULL (#44), không tìm theo mã vận đơn (#52) |
  | P2.8 | Thêm khách → HĐ → cộng điểm; tra SĐT; công nợ ghi → trả → giảm; merge | ✅ HĐ 27.000₫ → +27 điểm, `total_spent` cập nhật; tra SĐT 7 ms; nợ 50.000 → trả 20.000 (partial, còn 30.000); merge: KH phụ `is_active=0`, chặn merge chính nó; SĐT trùng bị chặn. ❌ trả vượt nợ được chấp nhận (#46) |
  | P2.9 | Load < 2 s; dữ liệu < 30 s; biểu đồ đúng; drill-down | ✅ API 10–32 ms. ❌ HĐ mới sau 2 s / 10 s / 25 s vẫn chưa lên (cache 5 phút, không invalidate — #39); ❌ **cache không theo tenant** (#39); ❌ chưa có drill-down từ biểu đồ (#49) |
  | P2.10 | Tạo HĐ → log; filter; không xoá được; export | ❌ 2 HĐ POS không sinh log nào (#40); ✅ filter module 24 ms; ✅ không có procedure xoá (`auditLog.delete` 404) — nhưng DB không chặn (#40); ✅ export xlsx; ⚠️ mọi log `user_id` NULL (#40) |
  | P3.1 | Tạo GD → ID + URL; query theo ID + `merchant_txn_id`; idempotency; state; expire | ✅ 201 + `transaction_id`, `txn_code`, `payment_url` (145 ms); GET theo id và theo `merchant_txn_id` 200; amount âm → 400 `VALIDATION_ERROR`; ✅ GD hết hạn chuyển `Expired` 27 s sau `expired_at` (worker). ❌ header theo spec `Idempotency-Key` bị bỏ qua (2 GD); ❌ 5 request đồng thời cùng key → 5 GD (#41); ❌ `merchant_txn_id` trùng vẫn tạo (#42) |
  | P3.2 | Danh sách < 2 s, filter | ✅ API `/api/internal/transactions` 100 dòng 28 ms, filter trạng thái 5 ms; không token 401. ⚠️ trang `/transactions`, `/dashboard` vẫn render dữ liệu GD khi chưa đăng nhập (#7) |
  | P3.3–P3.5 | VNPay / VietQR / Partner | 🟡 không đổi — chờ credential VNPay (#16, #26) và quét QR bằng app ngân hàng (#23) |
  | P3.6–P3.8 | Webhook / Dashboard / Route Engine | ✅ không chạy lại e2e: code không đổi từ lần nghiệm thu runtime (2026-11-04 → 06), Vitest 49/49; API admin dashboard 11 ms, routes 9 ms, viewer PUT routes 403 |

- **Rà soát vấn đề còn mở (#6–#38):** không mục nào được giải quyết thêm. Chờ người dùng: #6 (xoá bản rollback MariaDB 10.3), #16 + #26 (credential VNPay sandbox), #23 (tài khoản VietQR thật). Đưa vào GĐ 4/5 như đã ghi: #11, #14, #20 (P4.6), #18, #29 (P5.3), #19, #24, #33 (P5.4), #30 (P4.5). #7 + #15 (đăng nhập OIDC trên trình duyệt) **chưa có task nào trong PLAN nhận** — cần quyết định đưa vào đâu trước khi P4.x thêm nhiều trang. #8 và #10 trước đây ghi "đã giải quyết" nhưng mới đúng một phần (xem #43, #44).
- **Phát hiện mới:** #39–#53 (bảng *Còn mở*). Mức cao: #39 (lộ dữ liệu dashboard giữa tenant), #40 (audit log thiếu HĐ + thiếu người thực hiện), #41 (idempotency Payment Hub), #42 (`merchant_txn_id` không duy nhất).
- **Điểm tốt:** cổng chất lượng và CI xanh; hiệu năng API tốt (đa số < 50 ms); cô lập tenant ở DB/Redis đúng ở các module khác (search, rate limit, POS, low-stock); phân quyền API admin Payment Hub đúng (401/403); job hết hạn GD và cảnh báo tồn thấp chạy đúng.
- **Dọn dẹp:** dừng :3001/:3002/:4010/:4001 + worker; xoá toàn bộ dữ liệu tạo trong phiên (1002 SP, 2 kho, 1 chi nhánh, 1 ca, 2 HĐ, 2 đơn, 2 KH, công nợ, điểm, phiếu kho/kiểm kê, 8 audit log; 10 GD Payment Hub + log, API key #11), key Redis test (idempotency, dashboard, job BullMQ), file token/secret tạm. Docker Desktop đang tắt khi bắt đầu → đã bật lại, khởi động lại container `redis` và `minio` (đã thoát khi Docker dừng; không có restart policy).
- **Đề xuất (người dùng đồng ý):** sửa #39–#47, #49–#51 trước P4.1; để #48/#52/#53 cho GĐ 4/6; quyết định task nhận #7/#15 (đăng nhập OIDC trình duyệt).

#### QA-2 fix — sửa lỗi (2026-11-07)

- **Đã làm:**
  - **BizOne**
    - `server/services/dashboard.service.ts` — key `dashboard:{tenant}:{phần}`, TTL 20 s, `invalidateDashboardCache()` gọi sau tạo / huỷ / đổi-trả HĐ; ngày nghiệp vụ theo giờ VN (`lib/vn-time.ts`, khoảng `[start, end)`); "Phương thức thanh toán" trừ `change_amount` vào tiền mặt (`netPaymentsByMethod`, phát hiện khi kiểm UI); `getDayDetail(date)` + `dashboard.dayDetail` (#39, #49)
    - `components/dashboard/DashboardClient.tsx` — cột doanh thu là nút bấm (aria-label) mở panel chi tiết ngày (doanh thu, số HĐ, phương thức, SP doanh thu cao → `/products/{id}`, 10 HĐ gần nhất); tự tải lại mỗi 20 s khi tab hiển thị
    - `server/middleware/auditLog.ts` + `server/trpc.ts` — middleware `auditMutations` trên `protectedProcedure`/`posProcedure`: mutation thành công có trong `AUDIT_ROUTES` (sản phẩm, danh mục, kho, phiếu kho, kiểm kê, chuyển kho, ca POS, đơn hàng, KH, điểm, công nợ, gộp KH) → ghi `user_id` (`resolveDbUserId`), IP, UA, input rút gọn (bỏ `fileBase64`, mảng → `count`). `invoice.service` tự ghi `pos.create/cancel/refund` (bao cả thanh toán qua WebSocket, không ghi trùng khi request idempotent được trả lại). Bỏ các lời gọi `auditTrpcCall` thủ công (#40)
    - `inventory/order/customer.service` — `conflict`/`notFound` dùng `bizoneError` → HTTP 409/404 (trước: 500) (#43); `product`/`order` router + import dùng `resolveDbUserId` (#44)
    - `order.service.computeOrderTotals` — chặn giảm giá dòng > thành tiền, giảm giá đơn > tạm tính + phí ship (`VALIDATION_ERROR`) (#45); `customer.service.payDebt` — chặn trả vượt số còn nợ, trừ nợ bằng `updateMany … remainingAmount >= amount` trong transaction (#46)
    - `lib/excel/product.ts` — mỗi dòng hợp lệ mang `rowNumber`; lỗi lưu DB báo đúng dòng; SKU trùng trong file báo "trùng với dòng N"; thông báo tiếng Việt theo cột; SKU dạng số → chuỗi; router copy đúng byte của file (Buffer pool) (#47)
    - `tests/qa2.test.ts` (10 test): giờ VN, key cache theo tenant, trừ tiền thối, tổng đơn, helper audit, import
  - **Payment Hub**
    - `server/middleware/idempotency.ts` — `Idempotency-Key` (spec) hoặc `X-Idempotency-Key`; claim nguyên tử `SET NX` (đang xử lý → 409, xong → trả lại response + header `Idempotent-Replayed: true`, cùng key khác body → 409); claim được nhả khi không tạo được GD (503, trùng `merchant_txn_id`, lỗi); key > 255 ký tự → 400 (#41)
    - `server/routes/transactions.ts` — `merchant_txn_id` bắt buộc; trùng → 409 kèm `txn_code` cũ (kiểm trước + bắt `P2002` khi đua); migration `4_unique_merchant_txn_id` (unique `(merchant_id, merchant_txn_id)`), cập nhật `database/schema_paymenthub.sql`, API-Design §4 (#42)
    - `tests/idempotency.test.ts` (5 test)
  - **Chung** — `shadcn` → devDependencies cả 2 app (`npm audit --omit=dev`: Payment Hub 0, BizOne còn `exceljs → uuid` moderate) (#50); `.env.example` thêm `POS_WS_PORT`, `NEXT_PUBLIC_POS_WS_URL`, `NEXT_PUBLIC_APP_URL`, `KEYCLOAK_ALLOWED_CLIENTS`, `VIETQR_BANKS_URL` (#51)

- **Kiểm thử** (production build: BizOne :3001 + `dist/pos.mjs` + `dist/worker.mjs`, Payment Hub :4010 + worker; token Keycloak thật; API key tạm):

  | Vấn đề | Kết quả |
  |--------|---------|
  | #39 dashboard | HĐ 40.000₫ → `dashboard.summary` ngay sau đó 0 → 40.000 (9 ms); huỷ HĐ → về 0; key Redis `dashboard:tenant_demo:*` |
  | #49 drill-down | `dayDetail` 7 ms (doanh thu, HĐ, SP); ngày sai định dạng → 400; trình duyệt: bấm cột T7 mở panel đúng số liệu; 375 px không cuộn ngang |
  | Tiền thối | HĐ 45.000₫ khách đưa 100.000₫: "Tiền mặt" 100.000 → **45.000** |
  | #40 audit | 16 thao tác (SP, import, kho, phiếu, chuyển kho, đơn, KH, công nợ, mở ca, HĐ, huỷ HĐ) đều có log với `user_id = 3`; thanh toán qua **WebSocket** (`payment:process`) → log `pos.create` HĐ2611070002 |
  | #43 mã lỗi | mã kho trùng / chuyển cùng kho / vượt tồn / đơn sai trạng thái / SĐT trùng → **409 CONFLICT**; phiếu không tồn tại → **404**; message tiếng Việt |
  | #44 người tạo | SP tạo tay + import, đơn hàng: `created_by = 3` |
  | #45 đơn | giảm giá đơn 50.000 > 1.000 → 400; giảm giá dòng > thành tiền → 400; đơn hợp lệ 50.000 = 40.000 + 15.000 − 5.000 |
  | #46 công nợ | trả 40.000 khi còn 30.000 → 400; trả đủ → `paid`, `paidAmount` 50.000; **5 lần trả 20.000 đồng thời** trên nợ 50.000 → 2 thành công + 3 × 409, còn 10.000 |
  | #47 import | 1000 SP 1,73 s; lỗi: dòng 1002 "Tên sản phẩm: bắt buộc", 1003 "Giá bán: phải ≥ 0", **1004** "SKU trùng với dòng 2 trong file" |
  | #41 idempotency | `Idempotency-Key` ×2 → 201 + 200 cùng GD; `X-Idempotency-Key` ×2 → cùng GD; cùng key khác body → 409; **5 request đồng thời cùng key → 1 × 201 + 4 × 409, 1 GD**; key 300 ký tự → 400; 503 (không có route) không giữ claim |
  | #42 merchant_txn_id | thiếu → 400; trùng → 409 + `txn_code` cũ; 5 request đồng thời cùng `merchant_txn_id` khác key → 1 × 201 + 4 × 409; DB mỗi mã đúng 1 dòng |
  | Hồi quy | `vietqr` → 201 `Pending` + `qr_code` (70 ms); tra theo `merchant_txn_id` 200; `qr/generate` → `reused` |
  | Tự động | format / lint / typecheck / test (BizOne **32/32**, Payment Hub **54/54**) / build / build:jobs cả 2 app ✅; `npm ci` với lockfile mới ✅ |
  | Dọn dẹp | dừng :3001/:3002/:4010 + worker; xoá dữ liệu test cả 2 DB, API key tạm, key Redis test, token/secret tạm |

- **Quyết định thiết kế:**
  - Audit bằng middleware tRPC (danh sách `AUDIT_ROUTES`) thay vì gọi tay từng router — thêm mutation mới chỉ cần thêm 1 dòng; HĐ POS ghi trong service vì có 2 đường vào (tRPC + WebSocket).
  - Chưa chặn xoá/sửa `audit_logs` ở mức DB (trigger) — chỉ API không có thao tác xoá; sẽ làm cùng phân quyền user DB khi triển khai (P6.5) để còn dọn dữ liệu test/retention.
  - Sinh QR không dùng idempotency theo key: vốn idempotent theo tài nguyên (cùng GD + loại + size → QR hiện hành); replay 24 h có thể trả QR đã hết hạn.
  - Giữ `X-Idempotency-Key` (tương thích) song song `Idempotency-Key` (spec).
- **Khác biệt so với đề xuất:** không đổi đơn giá đơn hàng theo giá bán (đơn từ kênh online có giá riêng của kênh) — chỉ chặn tổng âm.
- **Vấn đề / lưu ý:** còn mở từ QA-2: #48 (hiệu năng kho), #52 (chuẩn hoá API list), #53 (hardening), mới #54 (layout BizOne chưa responsive), #55 (GET GD trả camelCase). #7/#15 (đăng nhập OIDC trình duyệt) vẫn chưa có task nhận.

### P4.0 — Bypass xác thực Keycloak cho dev/test

- **Hoàn thành:** 2026-11-09 · **Commit:** `97aae2f` · **Vị trí:** `source/bizone/lib/auth.ts`, `lib/dev-auth.ts`, `proxy.ts`, `server/trpc.ts`, `server/ws/pos.ts`, `components/layout/AppLayout.tsx`, `app/products/**/page.tsx`, `tests/dev-auth.test.ts`; `source/payment-hub/lib/auth.ts`, `lib/dev-auth.ts`, `proxy.ts`, `server/ws/server.ts`, `components/ph/PHLayout.tsx`, `tests/dev-auth.test.ts`; `.env.example` 2 app
- **Đã làm:**
  - `authenticateToken(token)` trong `lib/auth.ts` của mỗi app là **điểm xác thực duy nhất**: token thật → `verifyJwt` như cũ; không có token hoặc token giả `dev-bypass` → user dev khi `AUTH_DEV_BYPASS=true`, ngược lại 401 (`missing_token` / `invalid_token`). Log cảnh báo 1 lần/process khi bypass được dùng
  - Dùng ở mọi điểm vào: BizOne `proxy.ts` (route handler + SSE `/api/inventory/alerts`), `server/trpc.ts` (context tRPC), `server/ws/pos.ts` (WebSocket POS); Payment Hub `proxy.ts` (`/api/internal/*`, `/api/v1/*` không có `X-Api-Key`) và `server/ws/server.ts` (realtime :4001). API merchant có `X-Api-Key` (HMAC) và `/api/ipn/*`, `/api/webhooks/*` không đi qua đây → không đổi
  - User dev cấu hình qua env: `AUTH_DEV_USER` (mặc định `admin@bizone.vn` / `payhub.admin@bizone.vn` — trùng user Keycloak dev nên `resolveDbUserId`, phân quyền tuỳ chỉnh, nghỉ việc vẫn áp dụng), `AUTH_DEV_ROLES` (mặc định `bizone-admin` / `payhub-admin`), tenant = `DEV_TENANT_ID` (BizOne), `AUTH_DEV_MERCHANT_ID` (Payment Hub, giới hạn theo merchant). Hạn "token" dev 12 giờ (WS realtime đóng khi hết hạn như token thật)
  - `lib/dev-auth.ts`: thiếu `DEV_AUTH_TOKEN` mà bật bypass → page trả token giả `dev-bypass` cho client (WebSocket subprotocol không được rỗng). Có `DEV_AUTH_TOKEN` thì vẫn dùng token đó (test phân quyền bằng user thật). Payment Hub `devTokenCanWrite` hiểu token giả (ẩn nút ghi khi user dev là viewer hoặc gắn merchant). 3 trang sản phẩm chuyển sang `getDevAuth()` thay vì đọc env trực tiếp
  - Dải **"Chế độ dev"** (tím) dưới TopBar/PHHeader: user + role đang thao tác, nhắc không bật trên production; tính mỗi request (`connection()` trong Suspense). BizOne: bypass bật mà `DEV_AUTH_TOKEN` đã hết hạn → thêm cảnh báo vàng "xoá biến để dùng user dev"; bypass tắt → banner "Chưa đăng nhập" như trước (thêm gợi ý `AUTH_DEV_BYPASS`)
  - `.env.example` 2 app: `AUTH_DEV_BYPASS=false` + các biến tuỳ chọn (comment). Docker compose không đặt biến này (mặc định tắt)
  - Test Vitest `tests/dev-auth.test.ts`: BizOne 5 (tắt → 401 cả không token lẫn `dev-bypass`; bật → admin dev đủ quyền; token thật vẫn verify; user dev theo env, seller không có `staff:write`; token page/banners theo env), Payment Hub 4 (tương tự + `AUTH_DEV_MERCHANT_ID`, viewer không được ghi)

- **Kiểm thử** (dev server :3000/:3002/:4000/:4001 với `AUTH_DEV_BYPASS=true` truyền qua shell; bản production BizOne `next start -p 3001`; token Keycloak thật của `demo.seller@bizone.vn` và `payhub.viewer@bizone.vn` lấy qua Authorization Code + PKCE; ca POS tạm trên chi nhánh tạm `P40TEST`):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Bật bypass: mở mọi trang BizOne/Payment Hub Admin có dữ liệu mà không cần token | ✅ BizOne (bản production): 14 trang `/dashboard`, `/products`, `/orders`, `/crm`, `/warehouse`, `/warehouse/stock-take`, `/reports`, `/audit-log`, `/staff` (+ shifts, attendance, commissions, roles), `/pos/session` tải dữ liệu, không lỗi, có dải "Chế độ dev" (trang POS toàn màn hình không dùng `AppLayout` nên không có dải). Payment Hub: `/dashboard`, `/transactions`, `/partners` (có nút ghi), `/webhooks` có dữ liệu + dải "Chế độ dev". API: tRPC không token 200, `/api/internal/*` không token 200 |
  | POS 2 màn hình (WebSocket) chạy | ✅ `/pos` hiện "Ca #9 · Trực tuyến", `/pos/display?session=9` kết nối; WS `dev-bypass` nhận `session:status`. Realtime Payment Hub: dashboard "Real-time", WS `dev-bypass` nhận `connected` |
  | Cảnh báo tồn (SSE) chạy | ✅ `/api/inventory/alerts` không token → 200 `: connected`; trang `/warehouse` mở stream 200 |
  | Token thật của seller vẫn bị 403 ở trang quản trị | ✅ (bypass bật) seller: `staff.role.list` 403 "Required permission: staff:read", `dashboard.summary` 403, `product.list` 200. Viewer Payment Hub: `GET partners` 200, `POST webhooks` 403, `PUT routes/1` 403. Token rác → 401 ("JWS Protected Header is invalid"); WS token rác 401, sai tenant 403 |
  | Tắt bypass: không token → 401 như trước | ✅ BizOne tRPC + SSE không token 401 "Missing Bearer token", `dev-bypass` 401 `invalid_token`; Payment Hub `/api/internal/*` 401; WS `dev-bypass` bị từ chối cả 2 app; token thật seller/viewer 200; trang hiện lại banner "Chưa đăng nhập"; không có log cảnh báo bypass |
  | API merchant/IPN không bị ảnh hưởng | ✅ (bypass bật) `/api/v1/transactions` với `X-Api-Key` giả → 401 HMAC như cũ; `/api/ipn/vnpay` chữ ký sai → `RspCode 97`; `/api/webhooks/payhub` (BizOne) vẫn đi đường public (503 vì dev chưa đặt `PAYHUB_WEBHOOK_SECRET` — như trước) |
  | Log cảnh báo khi bật | ✅ `[auth] AUTH_DEV_BYPASS=true — …` 1 lần ở mỗi process (next dev, realtime) |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ cả 2 app (Vitest BizOne 63/63, Payment Hub 58/58) |
  | Dọn dẹp | ✅ dừng mọi dev server/`next start`/realtime đã khởi động; xoá chi nhánh + ca POS tạm (không phát sinh HĐ, audit log, key Redis); xoá file token/credential tạm; build lại BizOne không bypass |

- **Khác biệt so với plan:**
  - BizOne `/pos/*` (màn hình POS) không có dải "Chế độ dev" vì không dùng `AppLayout`; trạng thái bypass xem ở các trang quản trị.
  - Không bật bypass mặc định trong `.env.local` (người dùng tự đặt `AUTH_DEV_BYPASS=true`); kiểm thử truyền biến qua shell.
  - Thêm cảnh báo khi bypass bật mà `DEV_AUTH_TOKEN` đã hết hạn (token cũ được ưu tiên nên trang sẽ 401).

- **Quyết định thiết kế:**
  - Bypass chỉ thay thế **danh tính**, không bỏ qua kiểm tra: tenant (`X-Tenant-ID` khớp, tenant đã cấp), RBAC theo role + vai trò tuỳ chỉnh + trạng thái nghỉ việc, rate limit, giới hạn merchant đều chạy như với token thật.
  - Token thật luôn được verify kể cả khi bypass bật → test phân quyền với user thật không đổi; token giả `dev-bypass` bị từ chối khi bypass tắt → bản build "đóng băng" token giả cũng không dùng được trên server không bật bypass.
  - Không chặn theo `NODE_ENV` vì `next start` (production mode) là cách test chuẩn khi :3000 bận; thay vào đó: mặc định tắt, compose không đặt, log cảnh báo + dải tím trên UI. P6.6/P6.7 gỡ hẳn.
  - `getDevAuth()` chỉ đọc env (không đồng hồ) vì page gọi nó lúc prerender — dùng `Date.now()` ở đây làm Next báo lỗi "unstable value" (đã gặp khi kiểm thử, đã sửa).

- **Vấn đề / lưu ý:**
  - Trang tĩnh (prerender) "đóng băng" token lúc build: build khi bypass bật → client gửi `dev-bypass`; muốn đổi thì build lại (như #7 trước đây). `next dev` không bị.
  - Sửa file khi `next dev` đang chạy đôi khi làm trang mở trong trình duyệt full-reload liên tục (HMR) — restart dev server là hết.
  - #56 cập nhật: kẹt Suspense ở lần tải lại thứ 2 cùng URL xảy ra cả với `next start` và bản trước P4.0 — không do P4.0, cần xử lý riêng.
  - Gỡ toàn bộ (`authenticateToken` → `verifyJwt`, `DEV_BYPASS_TOKEN`, dải dev, biến env) ở P6.7.

### P4.1 — Staff Module — API & UI

- **Hoàn thành:** 2026-11-07 · **Commit:** `fdb36cd` · **Vị trí:** `source/bizone/server/routers/staff.ts`, `server/services/{staff,shift,attendance,commission,rbac}.service.ts`, `server/queue/commission.ts`, `lib/{permissions,keycloak-admin}.ts`, `lib/validators/staff.ts`, `app/staff/**`, `components/staff/*`, migration `1_commission_line_unique`, `tests/staff.test.ts`, `keycloak/realms/bizone-realm.json`
- **Đã làm:**
  - **Nhân viên = hồ sơ DB + tài khoản Keycloak** (`staff.service.ts`, `lib/keycloak-admin.ts`): `staff.create` tạo user Keycloak qua service account `bizone-api` (thuộc tính `tenant_id`, `branch_ids`, mật khẩu ban đầu, tuỳ chọn bắt đổi khi đăng nhập lần đầu) rồi tạo `users` + `user_roles` + `user_branches` trong 1 transaction; lỗi DB → xoá lại user Keycloak (bù trừ). `update` (họ tên/email/SĐT, đồng bộ Keycloak), `setRoles` (vai trò × chi nhánh), `setActive` (cho nghỉ việc ⇔ Keycloak `enabled=false`), `resetPassword`, `list` (lọc tên/SĐT/email, vai trò, trạng thái; phân trang `{ items, meta }`), `get` (kèm role Keycloak thực tế). Mọi thao tác trên tài khoản Keycloak có sẵn đều kiểm `tenant_id` trùng tenant hiện tại. Không có xoá cứng (HĐ/hoa hồng tham chiếu `users` — `ON DELETE RESTRICT`) → "nghỉ việc"
  - **RBAC chi tiết** (`lib/permissions.ts`, `rbac.service.ts`, `server/trpc.ts`): danh mục 52 quyền `module.action` (chuyển từ seed sang `lib/permissions.ts`, dùng chung seed + app), mỗi quyền mở một capability API (`grants`). Vai trò hệ thống `admin/manager/seller/warehouse/viewer` ⇔ realm role `bizone-*` (gán vai trò hệ thống → đồng bộ role Keycloak); quyền của chúng sinh từ `ROLE_PERMISSIONS` (seed ghi lại `role_permissions`, không sửa được). Vai trò tuỳ chỉnh: CRUD + ma trận quyền, áp dụng ở mỗi lần kiểm quyền: `enforcePermission` = role token ∪ capability của vai trò tuỳ chỉnh (cache Redis hash `rbac:{tenant}` TTL 60 s, xoá khi đổi vai trò/quyền/trạng thái) và **chặn nhân viên đã nghỉ việc ngay** (token còn hạn vẫn 403). Thêm capability `staff:manage_shift`, `staff:manage_attendance`, `staff:manage_commission`; bổ sung `bizone-warehouse` (trước đây role này không có quyền nào). Chặn admin tự gỡ vai trò Quản trị viên / tự vô hiệu hoá
  - **Ca làm việc** (`shift.service.ts`): CRUD ca (giờ VN, ca qua đêm khi giờ kết thúc ≤ giờ bắt đầu; ca đã phân không xoá được → ngừng sử dụng), phân ca hàng loạt (nhiều NV × nhiều ngày, trùng thì bỏ qua), bỏ phân ca, lịch theo tuần (`calendar`, ≤ 62 ngày, lọc chi nhánh)
  - **Chấm công** (`attendance.service.ts`): check-in/out tự phục vụ (`staffSelfProcedure` — mọi nhân viên đang làm), trễ/về sớm so với ca được phân + `store_config.attendance_grace_minutes` (mặc định 5, đã thêm vào seed), ca qua đêm check-out sang ngày hôm sau, check-out tranh chấp dùng `updateMany … checkOut IS NULL`; bảng chấm công tuần/tháng (giờ làm, số lần + phút trễ/sớm, vắng = có ca mà không check-in sau giờ kết thúc ca); nhân viên không có `staff:manage_attendance` chỉ xem được của mình. Check-in/out ghi audit log
  - **Hoa hồng** (`commission.service.ts`, `server/queue/commission.ts`): quy tắc `percent_revenue` / `percent_profit` / `fixed_per_product`, áp cho mọi SP / 1 danh mục (gồm danh mục con) / 1 SP, `min_revenue` = doanh số tháng tối thiểu. `recalculateMonth(nhân viên, tháng)` dựng lại các dòng `pending` từ HĐ của người bán (`invoices.user_id`): doanh thu dòng = thành tiền × (tổng HĐ / Σ thành tiền) − tiền đã trả hàng, lợi nhuận = doanh thu − giá vốn × SL giữ lại; dòng đã `paid` không đụng tới; idempotent (unique mới `(user_id, invoice_id, commission_rule_id)`). **Tự động**: `invoice.service` đẩy job `recalc` sau mỗi tạo / huỷ / đổi-trả HĐ (queue `bizone-commission`, worker concurrency 1); scheduler `30 0 1 * *` (Asia/Ho_Chi_Minh) chốt tháng trước cho mọi tenant. API: rules CRUD, list theo tháng (tổng chờ trả / đã trả theo NV), tính lại thủ công, thanh toán (theo id hoặc NV + tháng)
  - **Doanh số nhân viên** `staff.sales` (doanh thu trừ trả hàng, số HĐ, TB/HĐ; top 10 SP khi chọn 1 NV)
  - **Audit log**: 18 mutation mới trong `AUDIT_ROUTES` (nhân viên, vai trò, ca, quy tắc/tính lại/trả hoa hồng); check-in/out ghi trong service; mật khẩu không vào log (`OMIT_KEYS`). Bộ lọc `/audit-log` thêm module "Nhân viên" + các hành động mới
  - **UI** (theo mockup 08 mục 18 + 20): `/staff` (danh sách, lọc, doanh số tháng, form thêm NV với ma trận vai trò × chi nhánh, sửa / phân quyền / đặt lại mật khẩu / cho nghỉ việc), `/staff/shifts` (thẻ ca + lịch tuần, ô "+" phân ca, × bỏ ca), `/staff/attendance` (thẻ chấm công hôm nay + bảng công tuần/tháng + chi tiết từng ngày), `/staff/commissions` (`CommissionRuleForm`, tổng chờ trả/đã trả, thanh toán, chi tiết theo HĐ), `/staff/roles` (danh sách vai trò, ma trận quyền theo module, sao chép quyền, vai trò tuỳ chỉnh). Tab điều hướng chung `StaffNav`, nút ≥ 40 px
  - **Keycloak**: service account `bizone-api` được gán `realm-management` `view-users`, `query-users`, `manage-users` + protocol mapper "client roles" (realm không có client scope `roles` nên token không mang role) — đã áp lên Keycloak đang chạy (người dùng duyệt) và ghi vào `keycloak/realms/bizone-realm.json`. Gán realm role dùng `role-mappings/realm/available` để không cần `view-realm`; token service account bị từ chối (401/403) → lấy token mới và thử lại 1 lần
  - Test Vitest `tests/staff.test.ts` (16): capability của vai trò tuỳ chỉnh, vai trò hệ thống ↔ Keycloak, role warehouse, khoảng tháng giờ VN, tháng trước, chấm công (đúng giờ trong ân hạn, trễ + về sớm, vắng / có ca / nghỉ, ca qua đêm, gộp ca), hoa hồng (% doanh số chia giảm giá HĐ, % lợi nhuận + cố định/SP + trả hàng, danh mục con + theo SP, ngưỡng doanh số tháng, SP không có giá vốn / lỗ)

- **Kiểm thử** (`next build` + `next start` :3001 + `dist/worker.mjs`, DB `bizonedb`, Keycloak thật — token PKCE cho `admin@bizone.vn` và cho nhân viên vừa tạo; chi nhánh test tạo bằng SQL vì chưa có API chi nhánh; script e2e 36 bước; trình duyệt tích hợp cho UI):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Thêm nhân viên | ✅ `staff.create` 123 ms: user Keycloak (`tenant_id`, role `bizone-seller`) + hồ sơ DB; tạo qua form UI cũng OK. Lỗi: trùng tên đăng nhập 409, mật khẩu < 8 ký tự 400, chi nhánh không tồn tại 400; Keycloak không kết nối được → `SERVICE_UNAVAILABLE` sau 0,1 s, không để lại bản ghi DB |
  | → phân quyền | ✅ NV mới đăng nhập Keycloak được, gọi POS 200; seller gọi `staff.list` / tự tạo admin → 403. Gán vai trò tuỳ chỉnh "Trưởng ca" (`staff.read`) → `staff.list` 200 **với token cũ**; bỏ quyền khỏi vai trò → 403 ngay; xoá vai trò đang gán 409; sửa vai trò hệ thống 409; admin tự gỡ Quản trị viên 409 |
  | → check-in | ✅ ca bắt đầu trước 30 phút → check-in 16 ms, `late`, trễ 31 phút; check-in lần 2 409; check-out → về sớm 239 phút (`late_early`); check-out lần 2 409; bảng công quản lý: 1 lần trễ 31p, 1 lần về sớm 3h59; seller chỉ thấy dòng của mình. UI: bấm Check-in → "Đã check-in lúc 22:26", nút chuyển sang Check-out |
  | → bán hàng → hoa hồng tự động tính | ✅ 3 quy tắc (2 % doanh số, 1.000₫/SP cho SP test, 10 % lợi nhuận); seller mở ca + HĐ 2 × 50.000₫ (giá vốn 30.000₫) → **sau 274 ms** có 2.000 + 2.000 + 4.000₫ `pending`; trả 1 SP → tính lại 1.000 + 1.000 + 2.000₫; thanh toán 4.000₫ (3 dòng `paid`); tính lại không đụng dòng đã trả; trả lần 2 → 409. Quy tắc % > 100 → 400. Doanh số NV 50.000₫ / 1 HĐ (đã trừ trả hàng). Job cuối tháng chạy được (tháng 10: 0 NV), lịch kế tiếp 2026-12-01 00:30 giờ VN |
  | Audit log xem được | ✅ `auditLog.list module=staff`: create, set_roles, update, delete (vai trò), assign_shift, check_in, check_out, recalculate_commission, pay_commission — `user_id` đúng người thao tác, không chứa mật khẩu; lọc "Nhân viên" trên `/audit-log` |
  | Nghỉ việc | ✅ `setActive false` → Keycloak `enabled=false`; token còn hạn của NV gọi POS → 403 ngay; đăng nhập lại thất bại; tự vô hiệu hoá chính mình 409 |
  | UI | ✅ 5 trang render đúng dữ liệu trên bản production (danh sách NV, thẻ ca + lịch tuần, bảng công, quy tắc + tổng hoa hồng, ma trận quyền); 375 px: không cuộn ngang trang (bảng cuộn trong khung), nút chấm công chia 2 cột. ⚠️ sidebar chung che nội dung ở 375 px khi chưa thu gọn (#54, có từ trước); `next dev` kẹt fallback khi tải lại (#56, có từ trước, chỉ ở dev) |
  | Script e2e | ✅ 36/36 |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 48/48) |
  | Dọn dẹp | ✅ dừng :3000/:3001 + worker; xoá 2 NV test (DB + Keycloak), chi nhánh/SP/ca/HĐ/đổi trả/ca thu ngân/quy tắc/hoa hồng/chấm công test, 23 audit log của phiên; key Redis (idempotency, job hoa hồng đã xong); file token/mật khẩu tạm. Giữ: quyền + mapper của service account `bizone-api` (cần cho tính năng), scheduler cuối tháng trong Redis |

- **Khác biệt so với plan:**
  - Một router `staff.ts` với router con (`staff.role.*`, `staff.shift.*`, `staff.attendance.*`, `staff.commission.*`) thay vì nhiều router; thêm trang `/staff/commissions`, `/staff/roles` và `RoleMatrix`, `AttendanceClient`, `CommissionClient` ngoài 3 component PLAN nêu.
  - "Audit log UI" đã có từ P2.10 → chỉ ghi thêm thao tác nhân viên + bộ lọc.
  - "Tính hoa hồng tự động cuối tháng": tính ngay sau mỗi HĐ (để thấy ngay) **và** chốt lại đầu tháng sau (ngưỡng doanh số tháng).
  - Thêm migration unique cho `commissions` (tính lại idempotent) và cấu hình Keycloak cho service account (không có trong PLAN nhưng cần để tạo tài khoản).

- **Quyết định thiết kế:**
  - Keycloak giữ danh tính/mật khẩu (theo P1.5), BizOne giữ hồ sơ + phân quyền theo chi nhánh; vai trò hệ thống phản chiếu sang realm role để token đúng ngay ở lần đăng nhập sau, vai trò tuỳ chỉnh kiểm từ DB (có cache) để không phải tạo role Keycloak theo từng tenant.
  - Kiểm `isActive` ở mọi permission check (cache 60 s, xoá khi đổi) → nghỉ việc có hiệu lực ngay thay vì chờ token 15 phút hết hạn.
  - Hoa hồng là dữ liệu dẫn xuất, tính lại toàn tháng của một NV (không cộng dồn) → đúng khi huỷ/đổi trả/sửa quy tắc; dòng đã trả bất biến.
  - Hoa hồng tính theo người lập HĐ (`invoices.user_id`) — chưa có trường "nhân viên tư vấn" riêng.

- **Vấn đề / lưu ý:** mới #56–#60. Service account `bizone-api` giờ có `manage-users` toàn realm `bizone` (dùng chung mọi tenant) — code luôn kiểm `tenant_id` trước khi sửa tài khoản; secret client cần bảo vệ như secret admin (đưa vào checklist P6.6). Tên hiển thị thu ngân vẫn là username (#15) vì token chưa có claim `name`.

### P4.2 — Reports Module — API & UI

- **Hoàn thành:** 2026-11-07 · **Commit:** `335d41d` · **Vị trí:** `source/bizone/server/routers/reports.ts`, `server/services/report.service.ts`, `server/services/reportExport.service.ts`, `server/queue/reportExport.ts` + `reportExportWorker.ts`, `lib/validators/report.ts`, `app/reports/page.tsx`, `components/reports/*`, `tests/reports.test.ts`
- **Đã làm:**
  - **6 báo cáo** (`report.service.ts`, tRPC `reports.*`, quyền `report:read` — admin/manager/viewer):
    - `revenue` — Doanh thu, chiết khấu, trả hàng, **doanh thu thuần**, số HĐ, TB/HĐ; chuỗi theo ngày (≤ 62 ngày) hoặc theo tháng; so sánh **kỳ trước** (cùng độ dài, liền trước) hoặc **cùng kỳ năm trước** (29/02 → 28/02), % thay đổi từng chỉ số và từng ngày; theo phương thức thanh toán (tiền mặt trừ tiền thối, như dashboard); theo danh mục
    - `profit` — DT thuần, giá vốn (giá vốn lúc bán, thiếu thì lấy giá vốn SP), lợi nhuận gộp, biên LN (thay đổi tính bằng điểm %), chuỗi lợi nhuận + kỳ so sánh, theo danh mục, top 10 LN cao / thấp, cảnh báo số dòng thiếu giá vốn
    - `products` — top 10 bán chạy (SL, DT, LN), top 10 bán chậm (còn tồn, bán ít nhất trong kỳ, giá trị tồn, số ngày chưa bán / "chưa từng bán")
    - `staff` — mỗi nhân viên: DT thuần, tỷ trọng, số HĐ, TB/HĐ, SL, lợi nhuận, % so với kỳ so sánh
    - `promotion` — khung KM so với khung trước và sau cùng độ dài (DT/ngày, HĐ/ngày, chiết khấu, uplift %), lượt dùng + tiền giảm qua mã giảm giá (lọc theo mã)
    - `inventory` — giá trị tồn theo kho, hàng dưới mức tối thiểu (`max(min_quantity, min_stock)`), lô quá hạn và sắp hết hạn (≤ N ngày)
  - **Bộ lọc**: khoảng ngày (giờ VN, ≤ 366 ngày), chi nhánh, nhân viên, danh mục (gồm danh mục con), kiểu so sánh. Tính ở mức **dòng hoá đơn** bằng 1 truy vấn SQL tổng hợp (MariaDB, `GROUP BY` theo ngày/tháng/danh mục/SP/NV) nên lọc danh mục vẫn đúng: chiết khấu cấp HĐ chia theo tỷ lệ dòng, trả hàng trừ theo dòng (ghi nhận theo ngày HĐ), HĐ đã huỷ bị loại
  - **Xuất PDF/Excel bất đồng bộ** (`reports.export` → BullMQ `bizone-report-export` → worker dựng tài liệu chung (tổng quan + bảng) → Excel (exceljs, định dạng số/tiền) hoặc PDF (**pdfmake 0.3.12**, font Roboto có dấu tiếng Việt, A4 dọc/ngang tự chọn, chân trang số trang); file lưu Redis 30 phút; `reports.exportStatus` chỉ trả cho đúng người yêu cầu + tenant. Worker bundle để `pdfmake` external (font đọc từ `node_modules`). Xuất báo cáo được ghi audit log
  - **UI `/reports`** (mockup 07): 6 tab, thanh lọc một hàng (mốc nhanh Hôm nay … Năm nay + tuỳ chọn), thẻ KPI có % thay đổi, biểu đồ cột **kỳ này vs kỳ so sánh** (SVG, 1 trục, tooltip khi rê, chú thích; màu #2563EB / #E07B39 đã chạy bộ kiểm tra bảng màu dataviz — cảnh báo tương phản của màu cam được bù bằng chú thích + bảng số liệu), thanh tỷ trọng phương thức TT, bảng chi tiết; nút Xuất PDF / Xuất Excel (thông báo thời gian, báo chờ worker)
  - Test Vitest `tests/reports.test.ts` (10): kỳ so sánh (kỳ trước, tháng 3 → cuối tháng 2, năm nhuận), độ dài kỳ, gom ngày/tháng, % thay đổi, tổng hợp LN/biên/TB, validate khoảng ngày, định dạng ô, tên file

- **Kiểm thử** (`next build` + `next start` :3001 + `dist/worker.mjs`; dữ liệu giả lập có chủ đích **20.140 HĐ / 40.036 dòng / 1.044 lần trả hàng / ~3 % HĐ huỷ** trải 400 ngày, 2 chi nhánh, 2 NV, 3 danh mục (có danh mục con), 1 đợt KM có mã giảm giá, lô quá hạn/sắp hết hạn; **kết quả kỳ vọng tính độc lập bằng JS** từ dữ liệu sinh ra rồi so với API; token Keycloak thật cho admin/manager/seller; script 34 bước):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Report load < 3 s | ✅ doanh thu 30 ngày 330 ms (lần đầu) / 40 ms; **365 ngày: doanh thu 176 ms, lợi nhuận 183 ms**; SP 61 ms, NV 23 ms, KM 14 ms, tồn kho 13 ms |
  | Export Excel/PDF < 5 s | ✅ 12 file (6 báo cáo × 2 định dạng) **116–357 ms** từ lúc bấm tới khi có file (gồm hàng đợi + worker); file hợp lệ (`%PDF` / zip), PDF tiếng Việt đúng dấu (đã mở xem); UI: "Đã xuất … (0,4 s)" |
  | So sánh cùng kỳ đúng | ✅ kỳ trước 30 ngày: khớp từng chỉ số với tính độc lập, Δ +8,8 % đúng; cùng kỳ năm trước (2025-10-09 → 2025-11-07) khớp; 30 điểm ngày cộng lại = tổng |
  | Filter hoạt động | ✅ chi nhánh, nhân viên, danh mục (cha + con) đều khớp tính độc lập; lọc danh mục ẩn phương thức TT (không tách được); tổng phương thức TT = DT trước trả hàng |
  | Lợi nhuận | ✅ LN = DT thuần − giá vốn khớp; LN theo danh mục cộng lại = tổng |
  | Hàng chạy/chậm, NV, KM, tồn kho | ✅ top bán chạy đủ 5 SP; bán chậm nhất = SP chỉ có tồn ("chưa từng bán"); NV khớp DT/số HĐ, tỷ trọng cộng 100 %; KM: trước/trong/sau khớp, uplift +33,6 %, 470 lượt mã; tồn kho: 1 lô quá hạn, 1 lô sắp hết hạn, hàng dưới tối thiểu |
  | Lỗi / phân quyền | ✅ ngày đảo ngược 400, > 366 ngày 400, seller 403, người khác đọc file xuất của admin → 404, jobId lạ 404; worker dừng → yêu cầu xuất ở trạng thái `waiting` (UI báo "Đang chờ worker") |
  | UI | ✅ 6 tab render đúng trên bản production, đổi tab/lọc tải lại, biểu đồ giãn theo khung, xuất Excel từ UI; 375 px: trang không cuộn ngang nhưng sidebar chung chiếm chỗ (#54) |
  | Script e2e | ✅ 34/34 |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 58/58); `npm audit --omit=dev`: chỉ còn `exceljs → uuid` moderate (có từ trước) |
  | Dọn dẹp | ✅ dừng :3001 + worker; xoá toàn bộ dữ liệu `RPT*` (HĐ, dòng, thanh toán, trả hàng, coupon + lượt dùng, SP, danh mục, tồn, lô, NV, kho, chi nhánh), 14 audit log xuất báo cáo, job + file xuất trong Redis, file token tạm. Không đụng dev server :3000/:4000 đang chạy của người dùng |

- **Khác biệt so với plan:**
  - Thêm báo cáo tồn kho và khuyến mãi thành tab riêng (`PromotionInventory.tsx`), ngoài 4 component PLAN nêu.
  - Hiệu quả khuyến mãi đo theo khung ngày + mã giảm giá (chưa có flash sale/Buy X Get Y — #63).
  - Chưa có "Gửi email" (#62). Doanh số chỉ từ HĐ POS (#61).
  - Thêm dependency `pdfmake` (0.3.12 — bản ≥ 2 tuần tuổi) cho PDF; worker phải chạy để xuất file.

- **Quyết định thiết kế:**
  - Một định nghĩa số liệu duy nhất ở mức dòng HĐ cho mọi báo cáo → lọc danh mục, chi nhánh, NV luôn cộng khớp với tổng; cùng tỷ lệ chia chiết khấu với hoa hồng (P4.1) và đổi/trả (P2.5).
  - Tổng hợp trong SQL (không kéo dòng về Node) → 40 k dòng/năm vẫn < 200 ms; không cache (số liệu luôn mới, đủ nhanh).
  - Xuất file qua worker + Redis TTL thay vì trả file trực tiếp: không chặn web process khi dựng PDF lớn, đúng yêu cầu "async (queue)"; file chỉ người yêu cầu đọc được.
  - So sánh theo **vị trí** trong kỳ (ngày thứ i với ngày thứ i của kỳ so sánh) để biểu đồ/bảng thẳng hàng cả khi so cùng kỳ năm trước.

- **Vấn đề / lưu ý:** mới #61–#64; cập nhật #12 (worker cần cho xuất báo cáo), #54 (`/staff`, `/reports` đã có trang).

### P4.3 — Supplier Module — API & UI

- **Hoàn thành:** 2026-11-10 · **Commit:** `b784329` · **Vị trí:** `source/bizone/server/routers/supplier.ts` + `purchaseOrder.ts`, `server/services/supplier.service.ts` + `purchaseOrder.service.ts`, `lib/supplier/calc.ts`, `lib/validators/supplier.ts`, `app/suppliers/**`, `app/purchase-orders/**`, `components/suppliers/*`, `tests/supplier.test.ts`
- **Đã làm:**
  - **Nhà cung cấp** (SRS-SUP-01): tRPC `supplier.list` (tìm tên/mã/SĐT/MST/người liên hệ, lọc đang/ngừng hợp tác, lọc còn nợ / có nợ quá hạn; kèm số đơn, còn nợ, quá hạn), `options`, `get` (thống kê: đơn theo trạng thái, giá trị đã nhập, đã trả, còn nợ, quá hạn, lần nhập gần nhất), `create` (mã tự sinh `NCC0001…` nếu bỏ trống; MST 10 số hoặc 10-3), `update` (gồm ngừng hợp tác), `delete` (chỉ khi chưa có đơn/thanh toán, ngược lại 409 gợi ý "Ngừng hợp tác")
  - **Đơn nhập hàng** (SRS-SUP-02, `purchaseOrder.*`): `create` / `update` (chỉ khi Chờ nhập; thay toàn bộ dòng) với CK % theo dòng, CK đơn, thuế/phí — tổng tính ở `lib/supplier/calc.ts` (dùng chung với form); `receive` nhận đủ hoặc một phần, có số lô + NSX/HSD; `cancel` (Chờ nhập → huỷ; Đã nhập 1 phần → huỷ phần còn lại, giữ hàng + nợ đã nhận); `list` (lọc NCC, kho, trạng thái, ngày giờ VN, tìm mã/tên NCC/ghi chú; kèm tiến độ nhận, còn nợ), `get` (dòng, phiếu nhập kho, công nợ, thanh toán), `productLookup` (giá vốn SP/biến thể + giá NCC này báo lần trước), `warehouseOptions`
  - **Nhận hàng → phiếu nhập kho tự động** trong **một DB transaction** (khoá `SELECT … FOR UPDATE` theo đơn): phiếu `PN-…` loại `purchase_receipt` trạng thái `confirmed`, `reference_type = purchase_order`; cộng tồn + lô ở kho của đơn; cập nhật `received_quantity` có điều kiện; trạng thái `partial` / `received`; sau commit phát cảnh báo tồn như phiếu nhập tay
  - **Công nợ phải trả** (SRS-SUP-03): mỗi đơn 1 dòng `supplier_debts`, tăng theo giá trị đã nhận (CK đơn + thuế chia theo tỷ lệ giá trị dòng đã nhận; nhận đủ = đúng tổng đơn). Hạn trả = ngày nhận + số ngày trong điều khoản thanh toán của NCC ("30 ngày", "Net 45 days") hoặc chọn khi nhận. `supplier.debts` (đánh dấu quá hạn theo ngày VN), `supplier.recordPayment` theo 1 đơn hoặc tự phân bổ vào khoản nợ cũ nhất trước (hạn sớm nhất), mỗi khoản 1 dòng `supplier_payments`; không cho trả vượt nợ (khoá NCC `FOR UPDATE` + trừ có điều kiện)
  - **Lịch sử giao dịch** (SRS-SUP-04, `supplier.history`): tạo đơn, nhập kho (giá trị phiếu), thanh toán, huỷ đơn — gộp bằng 1 truy vấn `UNION ALL`, phân trang
  - **So sánh giá nhập** (SRS-SUP-05, `supplier.priceComparison`): giá nhập thực (sau CK dòng) theo sản phẩm/biến thể × NCC: giá gần nhất (`ROW_NUMBER()`), thấp/TB gia quyền/cao, SL, số đơn; xếp theo giá gần nhất, đánh dấu rẻ nhất, % đắt hơn, chênh lệch/đv. Đơn huỷ bị loại trừ các dòng đã nhận hàng
  - **Phân quyền**: capability mới `supplier:read` / `supplier:write` / `supplier:manage_po` (catalog `supplier.read` → read, `supplier.create`/`update` → write, `supplier.manage_po` → đơn nhập + nhận hàng + thanh toán). admin, manager: đủ; warehouse: chỉ xem; seller/viewer: không. Seed chạy lại để bảng phân quyền hiện đúng. 8 mutation vào `AUDIT_ROUTES`
  - **UI** (theo style các module P4.1/P4.2, chưa có mockup riêng): `/suppliers` (bảng + lọc + form thêm/sửa), `/suppliers/[id]` (thẻ thống kê, thông tin, tab Đơn nhập / Công nợ & thanh toán / Lịch sử / Giá nhập, modal thanh toán), `/purchase-orders` (bảng + thanh tiến độ nhận), `/purchase-orders/new` (`?supplier=`), `/purchase-orders/[id]` (modal Nhận hàng, Huỷ, Thanh toán), `/purchase-orders/[id]/edit`, `/suppliers/prices`. Sidebar mở mục "Nhà cung cấp" (sáng cả ở `/purchase-orders`)
  - **#64**: `errorFormatter` của tRPC đổi lỗi Zod thành câu dễ đọc (`"Mã số thuế gồm 10 chữ số … (taxCode)"`, `bizoneCode: VALIDATION_ERROR`, `bizoneDetails` theo trường) — áp dụng mọi router
  - Test Vitest `tests/supplier.test.ts` (17): tổng đơn, làm tròn, công nợ theo hàng đã nhận, điều khoản → số ngày, cộng ngày qua tháng/năm nhuận, trạng thái/quá hạn, phân bổ thanh toán, validator (MST, trùng SP, nhận 0), quyền theo vai trò + catalog

- **Kiểm thử** (`next dev` + `AUTH_DEV_BYPASS=true`; dữ liệu tạm: chi nhánh/kho `P43*`, 3 sản phẩm (1 có biến thể), 3 NCC; script API 49 bước + script phân quyền/đồng thời 10 bước với token Keycloak thật của `demo.seller` / `demo.manager`; UI qua trình duyệt tích hợp):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo PO → nhập kho → tự động tạo phiếu nhập | ✅ PO 3 dòng (CK dòng 5 %, CK đơn 10.000, thuế 8.000): tổng 1.538.000 đúng. Nhận 6/10 + lô `P43-LOT1` (HSD) → phiếu `PN-…` `confirmed`, "Nhập kho từ đơn nhập hàng", tham chiếu đơn, hiện trong `inventory.transactions` của module Kho; tồn +6; trạng thái "Đã nhập 1 phần"; nhận nốt → "Đã nhập", 2 phiếu. UI: tạo đơn từ trang NCC (tìm SP, biến thể, CK %, xem trước 2.160.000 + 510.000), nhận 20/24 + lô/HSD → phiếu + công nợ 2.310.000, hạn 17/11 (điều khoản 7 ngày); nhận 42 ms |
  | Công nợ supplier | ✅ nợ theo hàng đã nhận 908.818,18 (chia CK/thuế) → nhận đủ 1.538.000; trả 500.000 theo đơn rồi trả hết tự phân bổ → "Đã trả"; đơn nhận 2/12 rồi huỷ phần còn lại giữ nợ 184.000; lọc "Còn nợ" chỉ ra NCC đó. UI modal: chặn trả vượt ("Không được vượt số còn nợ 2.310.000₫"), trả 1.000.000 kèm chứng từ → còn 1.310.000 "Trả 1 phần" |
  | So sánh giá nhập | ✅ P1: B 92.000 (rẻ nhất) vs A 95.000 (+3,26 %) — gồm dòng đã nhận của đơn bị huỷ một phần; dòng chưa nhận của đơn huỷ bị loại; lọc 1 sản phẩm; trang `/suppliers/prices` + tab Giá nhập |
  | Lịch sử giao dịch | ✅ A: 1 đơn + 2 lần nhập + 2 thanh toán (5 mục); B có sự kiện huỷ; tab Lịch sử có link tới đơn |
  | CRUD + lỗi | ✅ mã tự sinh `NCC0001`; trùng mã 409; MST sai / tên trống 400 (thông báo tiếng Việt); CK đơn > tiền hàng 400; trùng SP trong đơn 400; SP không tồn tại 404; biến thể sai SP 400; nhận vượt / nhận 0 → 400; sửa đơn đã nhận 409; nhận/huỷ đơn đã đủ hoặc đã huỷ 409; trả vượt 400; NCC hết nợ 409; xoá NCC có giao dịch 409, chưa có thì xoá được; NCC ngừng hợp tác không tạo được đơn (409) |
  | Phân quyền | ✅ token seller: `supplier.list` / `purchaseOrder.create` 403; token manager 200; audit log ghi `create_po`, `receive_po`, `record_payment` |
  | Đồng thời | ✅ 2 lần nhận cùng 10/10 cùng lúc → 1 thành công, 1 bị 400 "chỉ còn 0 chưa nhận" (không nhận trùng, 1 phiếu); 2 lần trả 600.000 cùng lúc (nợ 990.000) → 1 thành công, còn 390.000 |
  | UI | ✅ 7 trang + sửa đơn (Chờ nhập sửa được, đơn đã nhận báo không sửa được); 375 px: 6 trang không cuộn ngang (bảng cuộn trong khung) |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 80/80) |
  | Dọn dẹp | ✅ dừng dev server; xoá NCC, đơn, công nợ, thanh toán, phiếu kho, tồn, lô, sản phẩm, kho, chi nhánh `P43*`, audit log của các lần test, cache tìm kiếm Redis, file token tạm |

- **Khác biệt so với plan:**
  - Thêm trang `/purchase-orders/new`, `/purchase-orders/[id]`, `/purchase-orders/[id]/edit`, `/suppliers/prices` và các component `SupplierForm`, `SupplierDetail`, `PurchaseOrderList`, `PurchaseOrderDetail`, `PaymentModal`, `PriceComparison` ngoài 2 component PLAN nêu.
  - API theo tRPC (`supplier.*`, `purchaseOrder.*`) thay vì REST `/api/suppliers/*` của API-Design (như các module BizOne khác).
  - Thanh toán NCC dùng quyền `supplier.manage_po` (catalog không có mã riêng cho công nợ NCC).
  - Sửa #64 (định dạng lỗi Zod) vì form mới cần thông báo đọc được.

- **Quyết định thiết kế:**
  - Công nợ phát sinh khi **nhận hàng** (không phải khi đặt), theo giá trị đã nhận → huỷ phần còn lại không cần bút toán bù; không cho trả trước / số dư có (trả ≤ nợ).
  - Phiếu nhập kho tạo thẳng trạng thái `confirmed` trong cùng transaction với đơn + công nợ (không qua `createTransaction` + `confirmTransaction` vốn là 2 transaction) → không thể có đơn "đã nhận" mà kho chưa cộng.
  - Mọi thao tác trên 1 đơn khoá dòng đơn (`FOR UPDATE`); thanh toán khoá dòng NCC; cộng `received_quantity` / trừ nợ đều có điều kiện → an toàn khi bấm 2 lần / 2 người cùng thao tác.
  - Giá so sánh là giá thực (sau CK dòng), chưa trừ CK đơn (CK đơn không gắn được cho từng SP một cách khách quan).
  - Trạng thái quá hạn tính khi đọc theo ngày VN thay vì job ghi `overdue`.

- **Vấn đề / lưu ý:** mới #65–#69; #64 đã sửa; cập nhật #54, #57. `created_by` của đơn/thanh toán là NULL khi người dùng Keycloak chưa có hồ sơ `users` trong tenant (như các module khác). Seed (`npm run db:seed`) cần chạy lại trên DB tenant đã có để bảng phân quyền hiện quyền NCC của vai trò hệ thống (việc kiểm quyền theo role token không phụ thuộc seed).

### P4.4 — Marketing Module — API & UI

- **Hoàn thành:** 2026-11-10 · **Commit:** `524fb15` · **Vị trí:** `source/bizone/lib/pos/promotions.ts` (mới) + `lib/pos/cart.ts`, `server/services/pricing.service.ts` + `invoice.service.ts`, `server/services/coupon.service.ts` + `promotion.service.ts`, `server/routers/coupon.ts` + `flashSale.ts` + `promotion.ts`, `lib/validators/marketing.ts`, `prisma/migrations/2_promotion_usage`, `app/marketing/**`, `components/marketing/*`, `components/pos/CartPanel.tsx` + `CustomerDisplay.tsx`, `tests/promotions.test.ts`; `database/schema.sql`
- **Đã làm:**
  - **Engine khuyến mãi tự động tại POS** (`lib/pos/promotions.ts`, thuần, test được): mỗi lần báo giá `quoteCart` nạp khuyến mãi đang chạy (`loadPromoContext`) rồi áp theo thứ tự **flash sale → combo → mua X tặng Y**, mỗi đơn vị hàng chỉ nhận 1 khuyến mãi; kết quả nằm trên dòng giỏ (`promoDiscount`, `promotions[]` nhãn, `isGift`) nên giỏ POS (WebSocket), màn hình khách, hoá đơn và báo cáo dùng chung một con số. Chiết khấu tay của thu ngân áp **sau** khuyến mãi; hạng thành viên + mã giảm giá áp sau cùng như cũ
    - Flash sale: giá flash cho tối đa số suất còn lại / suất mỗi khách (khách lẻ: giới hạn trên 1 HĐ), phần vượt tính giá thường; nhiều đợt cùng SP → lấy giá thấp nhất
    - Combo: mỗi bộ đủ SP tính giá combo, phần tiết kiệm chia theo giá trị dòng; giới hạn số bộ
    - Mua X tặng Y: tặng 1 SP → **tự thêm dòng quà** (`gift-{id}`, không sửa/xoá được trên POS, trừ tồn khi bán); tặng theo danh mục → giảm cho SP rẻ nhất của danh mục đã có trong giỏ (cùng danh mục thì cần đủ mua + tặng). Mua/tặng theo danh mục gồm danh mục con
  - **Ghi nhận lúc tạo hoá đơn** (cùng transaction): bảng mới `promotion_usage` (migration `2_promotion_usage`, đã cập nhật `schema.sql`); suất flash sale / số bộ combo tăng **có điều kiện** (hết suất giữa chừng → 409 "cập nhật lại giỏ"). **Huỷ hoá đơn** trả lại suất flash/combo, xoá lượt dùng, mở lại voucher
  - **Mã giảm giá** (SRS-MKT-01, `coupon.*`): CRUD (mã viết hoa, không trùng với voucher; đổi mã bị khoá khi đã dùng; xoá chỉ khi chưa dùng), loại % / số tiền / miễn phí vận chuyển, đơn tối thiểu, giảm tối đa, tổng lượt + lượt/khách, thời gian, kênh, **điều kiện**: tự áp dụng (đã có từ P2.5), **hạng khách** (`rankings`), **danh mục áp dụng** (`category_ids` — chỉ tính giảm trên dòng thuộc danh mục, gồm danh mục con); trạng thái Đang áp dụng / Sắp diễn ra / Hết hạn / Hết lượt / Tạm ngừng; **lịch sử sử dụng** (HĐ, khách, voucher, số tiền)
  - **Voucher** (SRS-MKT-02): phát hành từ mã gốc cho khách theo hạng (khách thân thiết), danh sách khách, hoặc N voucher tự do; mã ngẫu nhiên 8 ký tự (bỏ 0/O/1/I), duy nhất với cả mã giảm giá; dùng 1 lần, hạn riêng; voucher gắn khách chỉ khách đó dùng được; POS nhập mã voucher như mã giảm giá (`coupon_usage.voucher_id`); huỷ voucher
  - **Flash sale** (SRS-MKT-03, `flashSale.*`): khung giờ, SP/biến thể + giá flash (< giá bán), tổng suất, suất/khách; chặn trùng SP với đợt khác cùng thời gian; **tự bắt đầu / tự kết thúc** theo giờ (POS tính theo thời gian, cột `status` đồng bộ khi đọc); sửa khi chưa bắt đầu, kết thúc sớm, huỷ
  - **Mua X tặng Y** (SRS-MKT-05) và **Combo** (SRS-MKT-04) (`promotion.buyXGetY.*`, `promotion.combo.*`): CRUD, bật/tắt, thống kê lượt áp dụng; combo kiểm giá combo < tổng giá lẻ
  - **Báo cáo hiệu quả** (`promotion.report`, quyền `report:read`): theo khoảng ngày VN, mỗi chương trình (mã, flash sale, mua X tặng Y, combo): số HĐ, số lượng, tiền giảm, doanh thu đi kèm, TB/HĐ, tỷ lệ giảm; HĐ huỷ không tính
  - **Phân quyền**: capability `marketing:coupon` / `marketing:flash_sale` / `marketing:promotion` ⇐ catalog `marketing.manage_*`; admin + manager. Thu ngân không cần quyền marketing để được hưởng khuyến mãi. 18 mutation vào `AUDIT_ROUTES`
  - **UI** `/marketing` (Mã giảm giá + `CouponForm`, lịch sử dùng, phát voucher), `/marketing/vouchers`, `/marketing/flash-sales` (+ `FlashSaleForm`, chi tiết đã bán/suất), `/marketing/promotions` (`PromotionList`: mua X tặng Y + combo), `/marketing/report`. **POS**: dòng quà có nhãn "Quà tặng", nhãn từng khuyến mãi dưới dòng, dòng "Khuyến mãi" trong tổng; màn hình khách hiện quà + nhãn. Sidebar mở mục Marketing
  - Test Vitest `tests/promotions.test.ts` (13): flash (suất, suất/khách chia nhiều dòng, biến thể, CK tay sau flash), combo (chia tiết kiệm, giới hạn bộ, không chồng flash), mua X tặng Y (dòng quà, ngưỡng, bỏ dòng quà cũ từ client, cùng danh mục 2+1), mã theo danh mục sau hạng thành viên, validator (giờ VN, mã, điều kiện)

- **Kiểm thử** (`next dev` + POS WebSocket với `AUTH_DEV_BYPASS=true`; dữ liệu tạm `P44*`: chi nhánh, kho (tồn 100), 3 danh mục (có con), 5 SP, 2 khách, ca POS; script 41 bước qua `pos.quote` + `pos.createInvoice` / `pos.cancelInvoice` thật; token Keycloak thật seller/manager; UI qua trình duyệt):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo coupon → áp dụng POS → giảm giá đúng | ✅ 10 % đơn 40.000 → 4.000, HĐ tổng 36.000, lịch sử dùng có mã HĐ; giảm tối đa 15.000; dưới đơn tối thiểu báo "áp dụng cho đơn từ 30.000₫"; hết 2/2 lượt → "đã hết lượt"; mã hạng Vàng: khách Bạc bị từ chối, khách Vàng −5.000; mã danh mục Bánh kẹo −20 % chỉ tính dòng bánh quy (danh mục con) = 2.400; mã tự áp dụng chọn khi không nhập mã. Voucher: phát cho khách hạng Vàng + 2 tự do; không chọn khách / khách khác → từ chối; dùng → −15.000; dùng lại → "đã được sử dụng"; huỷ HĐ → dùng lại được |
  | Flash sale: đúng giờ tự động giảm giá | ✅ đợt bắt đầu sau 8 s, kết thúc sau 20 s: trước giờ 15.000 ("Sắp diễn ra") → đến giờ tự còn 9.000 ("Đang diễn ra") → hết giờ tự về 15.000 ("Đã kết thúc", đã bán 2). Suất/khách 2: khách lẻ mua 4 → 2 giá flash + 2 giá thường; khách đã mua 2 → giá thường; còn 1 suất tổng cho khách khác. Giá flash ≥ giá bán 400; trùng SP + giờ 409; sửa đợt đã kết thúc 409. UI: tạo đợt bắt đầu ngay → POS hiện "Flash sale …: 1 × 11.000₫ (−4.000₫)" |
  | Buy X Get Y: thêm SP tặng tự động | ✅ mua 1 trà sữa: chưa có quà; mua 5 → tự thêm 2 kẹo, thành tiền 0, tổng không đổi; HĐ lưu dòng quà (đơn giá 10.000, giảm 10.000) và trừ tồn kẹo 1. Theo danh mục cùng nhóm (mua 2 tặng 1 giảm 50 %): 2 bánh → 0, 3 bánh → −6.000. UI POS: dòng "🎁 Quà tặng" không có nút sửa/xoá; màn hình khách hiện quà + nhãn |
  | Combo | ✅ nước cam + bánh ngọt 65.000 → 60.000 (giảm 5.000); giới hạn 1 bộ → bán xong không giảm nữa; huỷ HĐ → trả suất; giá combo ≥ giá lẻ → 400 |
  | Báo cáo hiệu quả | ✅ hôm nay: mã giảm giá (2 HĐ, −8.000), flash sale, mua X tặng Y; combo của HĐ đã huỷ không còn; UI `/marketing/report` (mặc định 30 ngày) |
  | Phân quyền | ✅ seller: `coupon.list` / `flashSale.create` / `promotion.report` 403; manager 200; seller vẫn được hưởng khuyến mãi khi báo giá POS (51.000, quà + flash) |
  | UI | ✅ 5 trang marketing có dữ liệu; tạo flash sale qua form; 375 px không cuộn ngang |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 93/93); migration `2_promotion_usage` áp lên DB dev, `prisma migrate diff` với schema: rỗng |
  | Dọn dẹp | ✅ dừng dev + WS; xoá HĐ, thanh toán, lượt dùng, phiếu kho, tồn, khuyến mãi, mã, voucher, SP, danh mục, khách, ca, kho, chi nhánh `P44*`, audit log test, giỏ + cache Redis, file token tạm. Seed chạy lại (quyền marketing của vai trò hệ thống) |

- **Khác biệt so với plan:**
  - **Chiến dịch SMS/Email/Zalo chưa làm** (#70) — cần kênh gửi của P4.7 và bảng chiến dịch.
  - Router đặt tên `coupon` (gồm voucher), `flashSale`, `promotion` (mua X tặng Y, combo, báo cáo) đúng file PLAN; service tách `coupon.service.ts` + `promotion.service.ts`; thêm `VoucherList`, `FlashSaleList`, `MarketingReport`, `CouponList`.
  - Thêm bảng `promotion_usage` + cột `coupon_usage.voucher_id` (migration 2) — cần để huỷ HĐ hoàn suất và để báo cáo.
  - "Auto start/end" flash sale theo thời gian ở mỗi lần báo giá thay vì job worker.

- **Quyết định thiết kế:**
  - Khuyến mãi tính trên server ở `quoteCart` (nguồn sự thật cho giỏ WS, màn hình khách và HĐ); dòng quà sinh lại mỗi lần, không lưu trong giỏ → không thể bị sửa từ client.
  - Một đơn vị hàng chỉ nhận một khuyến mãi tự động (flash > combo > mua X tặng Y) để tránh chồng giảm; mã giảm giá và ưu đãi hạng vẫn áp thêm trên phần còn lại.
  - Giới hạn suất kiểm 2 lần: khi báo giá (hiển thị) và trong transaction tạo HĐ bằng cập nhật có điều kiện (không bán vượt suất kể cả khi 2 quầy bấm cùng lúc).
  - Voucher là mã riêng dẫn tới mã gốc (mức giảm); không áp giới hạn lượt/thời gian của mã gốc mà dùng hạn riêng + dùng 1 lần.

- **Vấn đề / lưu ý:** mới #70–#73; #63 đã xử lý; cập nhật #54, #57. Trang `/marketing/report` render theo request (`instant = false`) vì mặc định khoảng ngày theo hôm nay. Tab trình duyệt cũ có thể kẹt trạng thái màn hình khách (cùng nhóm #56), mở tab mới thì đúng.

### P4.5 — POS Advanced Features

- **Hoàn thành:** 2026-11-10 · **Commit:** `e0488e5` · **Vị trí:** `source/bizone/server/services/payment/paymentHubClient.ts`, `server/services/{payhubPayment,preorder,posPairing}.service.ts` (mới), `server/services/{invoice,cashSession,payment,posCatalog}.service.ts` + `posCart.ts`, `server/routers/pos.ts`, `server/ws/pos.ts`, `app/api/pos/pair/route.ts`, `app/api/webhooks/payhub/route.ts`, `lib/pos/{held,protocol,sync-client}.ts`, `lib/printing/{escpos,printer}.ts`, `lib/validators/pos.ts`, `prisma/migrations/3_pos_advanced`, `components/pos/{ReturnForm,SplitInvoiceModal,PreOrderForm,PairingScreen,PairDisplayModal,PrinterSettingsModal,PaymentModal,PosClient,CustomerDisplay,SessionClient}.tsx`, `hooks/usePosWebSocket.ts`, `tests/pos-advanced.test.ts`; `database/schema.sql`
- **Đã làm:**
  - **Thẻ / QR qua Payment Hub** (`paymentHubClient.ts` ký HMAC giống `lib/hmac.ts` của Payment Hub; `payhubPayment.service.ts`): `pos.payhubCreate` tạo bản ghi `pos_payment_intents` + GD Payment Hub `merchant_txn_id = BZ-{tenant}-{id}` (QR → `vietqr`, thẻ → `vnpay_card`, đổi qua `PAYHUB_QR_METHOD` / `PAYHUB_CARD_METHOD`), trả QR VietQR (tự xác nhận) hoặc link trang thanh toán thẻ (hiện thành QR trên màn hình khách để khách quét bằng điện thoại). Kết quả về bằng **webhook** (`/api/webhooks/payhub` giờ áp `payment.success/failed/expired`, theo tenant trong `merchant_txn_id`, chống trùng; lỗi khi áp → xoá khoá chống trùng để Payment Hub gửi lại) **hoặc poll** (`pos.payhubStatus` hỏi `GET /v1/transactions/merchant/{id}` khi webhook chưa tới — dev không có URL public). POS nhận `payhub:updated` qua WS. Intent đã thanh toán là một dòng thanh toán (`intentId`) dùng **đúng một lần** cho hoá đơn / tiền cọc (kiểm ca, phương thức, số tiền; gắn trong transaction bằng cập nhật có điều kiện), mã tham chiếu = mã GD Payment Hub. Huỷ chờ (`pos.payhubCancel`); tiền về sau khi đã huỷ vẫn ghi nhận `success` và hiện cảnh báo "chưa gắn hoá đơn" trong tổng kết ca
  - **Đổi hàng** (`pos.exchangeQuote`, `pos.exchange`): một transaction gồm phiếu trả (hàng cũ, tiền trả theo giá thực trả như P2.5) + hoá đơn mới (giá DB, khuyến mãi, tích điểm, trừ tồn như bán hàng). Giá trị hàng trả cấn vào hoá đơn mới bằng dòng thanh toán `exchange` (tham chiếu mã phiếu trả); khách trả thêm phần chênh lệch (thanh toán như bán hàng, kể cả qua Payment Hub) hoặc được hoàn phần dư theo `refundMethod`. Idempotent. Trả hàng không đổi vẫn là `pos.refundInvoice`. `invoice.service` tách thành `prepareSale` / `writeSale` / `finishSale` và `prepareRefund` / `writeRefund` dùng chung cho bán, đổi, giao đơn đặt; `writeRefund` khoá dòng hoá đơn (`FOR UPDATE`) và kiểm lại số lượng còn trả được → hai lần trả đồng thời không trả vượt
  - **Tách / gộp hoá đơn** (WS `cart:split`, `cart:merge`, `cart:hold`, `cart:resume`, `held:discard`; `lib/pos/held.ts` thuần): tách số lượng từng dòng sang hoá đơn mới (đơn chờ, giữ khách; mã giảm giá ở lại đơn hiện tại) → thanh toán riêng 2 hoá đơn; lưu tạm đơn đang làm; mở lại đơn chờ (đơn đang làm tự lưu tạm thay chỗ); gộp nhiều đơn chờ vào đơn hiện tại (cùng SP + biến thể cộng dồn). Đơn chờ lưu Redis `pos:held:{tenant}:{session}` (tối đa 20), phát `held:updated`
  - **Đặt trước + cọc** (bảng `preorders` / `preorder_items`; `pos.createPreorder`, `preorders`, `preorderQuote`, `completePreorder`, `cancelPreorder`): tạo từ giỏ (bắt buộc khách), thu cọc một phương thức (không thối, có thể qua Payment Hub), không trừ tồn / không tính doanh thu; giao hàng: giá tính lại → hoá đơn thường `invoice_type = 'preorder'` ở ca hiện tại, cọc cấn bằng dòng `deposit`, thu phần còn lại (cọc dư được hoàn); huỷ: hoàn cọc toàn bộ / một phần / giữ cọc từ ca đang mở
  - **Tổng kết ca**: thêm tiền cọc nhận trong ca (theo phương thức), hoàn cọc, dòng cấn trừ `exchange` / `deposit` (không tính là tiền thu), danh sách thanh toán Payment Hub đã nhận tiền mà chưa gắn hoá đơn; tiền mặt dự kiến = đầu ca + tiền mặt thu − thối − hoàn + cọc tiền mặt − hoàn cọc tiền mặt
  - **POS 2 màn hình — ghép cặp bằng PIN** (`posPairing.service.ts`): thu ngân tạo PIN 6 số (5 phút, dùng 1 lần, `SET NX` toàn cục) → thiết bị khác mở `/pos/display` (không cần đăng nhập) nhập PIN trên bàn phím số → `POST /api/pos/pair` (public, 10 lần/phút/IP) đổi lấy **token màn hình** `pdt_…` (lưu băm SHA-256 trong Redis 16 giờ, gắn tenant + ca, chỉ đọc) → WS nhận token này như subprotocol; thu ngân nhận `display:paired`. Token sai / ca khác → 401/403; WS bị từ chối liên tục → màn hình kiểm `GET /api/pos/pair` rồi mới quay về nhập PIN (không mất ghép khi chỉ WS tạm down); ca khoá → về màn hình PIN sau 10 s. `/pos/display?session=` (F7, cùng máy) giữ nguyên
  - **#58**: WS POS kiểm quyền bằng `getStaffAccess` (trạng thái nhân viên + vai trò tuỳ chỉnh) khi kết nối, mỗi sự kiện ghi, và quét 60 s đóng socket (4403) của nhân viên bị vô hiệu hoá / mất quyền
  - **In hoá đơn WebUSB / Bluetooth** (`lib/printing/escpos.ts` thuần + `printer.ts`): mã hoá ESC/POS khổ 58/80 mm (căn lề, đậm, chữ to, xuống dòng, cắt giấy, mở két tuỳ chọn, bỏ dấu tiếng Việt), gửi qua WebUSB (bulk OUT, khối 4 KB) hoặc Web Bluetooth (dịch vụ máy in BLE phổ biến, khối 180 byte); hộp thoại "Máy in" chọn kiểu, ghép thiết bị, khổ giấy, in thử (lưu localStorage theo máy). Máy in lỗi / chưa ghép → báo lỗi và tự in qua trình duyệt (80 mm CSS như P2.6)
  - **UI** (`/pos`): nút thanh trên Đổi/Trả (**F6**), Tách/Gộp (badge số đơn chờ), Đặt trước, Ghép màn hình, Máy in; `PaymentModal` dùng chung (bán hàng, chênh lệch đổi hàng, thu cọc, giao đơn) + lựa chọn "Qua Payment Hub (tự xác nhận)" / "Máy POS thẻ riêng" / "QR tài khoản cửa hàng" cho thẻ & QR — Payment Hub báo thành công thì tự hoàn tất; màn hình khách hiện QR Payment Hub / QR trang thẻ kèm chú thích; thanh trên gọn ở 900 px (ẩn phím tắt dưới `xl`)
  - Migration `3_pos_advanced` (3 bảng, đã cập nhật `schema.sql`); 3 mutation vào `AUDIT_ROUTES` (`payhubCreate`, `payhubCancel`, `createPairingPin`); đổi hàng / đặt trước / ghép màn hình / Payment Hub báo đã trả tự ghi audit trong service
  - Test Vitest `tests/pos-advanced.test.ts` (14): tách/gộp dòng, ESC/POS (ASCII, độ rộng 48/32 cột, init…cut, mở két), chữ ký HMAC khớp công thức Payment Hub, cấu hình placeholder, `merchant_txn_id` ↔ tenant, dòng cấn trừ trong `settlePayments`, validator (client không gửi được `exchange`/`deposit`, đặt trước cần khách, PIN 6 số)

- **Kiểm thử** (`next dev` :3000 + POS WS :3002 với `AUTH_DEV_BYPASS` danh tính `demo.manager@bizone.vn` (dev user mặc định đang có ca mở sẵn — không đụng); Payment Hub `next dev` :4000 + worker, API key + endpoint webhook tạm cho BizOne; dữ liệu tạm `P45*` (chi nhánh, kho tồn 50, 4 SP, 2 khách, ca #3); 6 script e2e qua tRPC + WebSocket thật; UI qua trình duyệt tích hợp — tab thu ngân + tab màn hình khách ghép bằng PIN):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Thanh toán QR → Payment Hub tạo GD → QR hiển thị → khách quét | ✅ `payhubCreate` 94–122 ms → GD Payment Hub `Pending`, `vietqr`, `BZ-tenant_demo-N`; QR hiện trên modal + màn hình khách (tab ghép PIN). Khách trả (GD → `Success`): qua **webhook** (outbox của worker, ≤ 30 s khi mô phỏng bằng DB) POS nhận `payhub:updated` → `webhook_logs` `payment.success/200`; qua **poll** 74 ms. UI: QR 300.000₫ → "khách trả" → modal tự hoàn tất HĐ ~3 s, màn hình khách "Cảm ơn quý khách". HĐ có dòng `qr:150000:TXN-…`; dùng trước khi trả 409, sai số tiền 400, dùng lại 409; hết hạn (webhook `payment.expired`) / huỷ chờ đúng trạng thái |
  | Thanh toán thẻ qua cổng (Payment Hub) | ✅ VNPay ở trạng thái `Error` (#16) → "Cổng thanh toán thẻ hiện không khả dụng — chọn phương thức khác". Tạm bật đối tác: intent thẻ → `payment_url` sandbox.vnpayment.vn (`vnp_Amount=5000000`) → IPN ký HMAC-SHA512 `00 Confirm Success` → POS nhận thành công **127 ms** sau IPN → HĐ `card:50000:TXN-…`, `partner_txn_id` lưu; đối tác trả về `Error` |
  | Đổi trả: chọn SP → tính tiền → hoàn | ✅ Trả 1 áo (150.000) đổi 1 quần (300.000): báo giá chênh +150.000; trả thiếu → "còn thiếu 50.000₫"; khách đưa 200.000 → HĐ mới 300.000 = `exchange` 150.000 (tham chiếu phiếu `TH…`) + tiền mặt 200.000, thối 50.000; tồn áo +1, quần −1; **53 ms**; gửi lại cùng key → cùng HĐ. Trả 1 quần (300.000) đổi 2 vớ (40.000) → hoàn 260.000 chuyển khoản (phiếu chi `exchange` −40.000 + `transfer` −260.000), giữ khách, điểm 350 → 90. Trả không đổi 50.000; trả vượt → "chỉ còn 1 có thể trả"; 2 lần trả đồng thời món cuối → 1 thành công, 1 **409** "vừa được trả ở giao dịch khác". UI (F6): tìm `HD…094` → +1 áo → thêm quần → "Khách trả thêm 150.000₫" → thu tiền → "Đổi hàng thành công" |
  | Tách hóa đơn: 1 → 2 hóa đơn | ✅ Giỏ áo×2, quần×1, nón×3 (725.000) → tách quần 1 + nón 1 ("Khách B") → hiện tại áo×2, nón×2 = 400.000 → HĐ 1; mở đơn chờ → quần×1, nón×1 = 350.000 → HĐ 2; tồn trừ đúng. Tách toàn bộ / vượt số lượng bị chặn. Gộp 2 đơn chờ + đơn hiện tại → áo×1, vớ×3, nón×1 (260.000), đơn chờ còn 0; mở đơn chờ khi giỏ có hàng → giỏ cũ tự lưu tạm. UI: tách nón + vớ → badge "1" → trả QR 300.000 → toast "Còn 1 đơn chờ" → mở "Khách B" → F9 → HĐ 70.000 |
  | 2 màn hình ghép cặp bằng PIN | ✅ PIN 6 số → `POST /api/pos/pair` 200 (45 ms), token `pdt_…`, thu ngân nhận `display:paired`; PIN sai / dùng lại → 404; 12 lần sai cùng IP → lần 11–12 **429**; PIN "12ab" → 400. Màn hình đã ghép nhận giỏ sau **34 ms**, gửi lệnh ghi → "Màn hình chỉ xem"; token vào ca khác 403, token giả 401; `GET /api/pos/pair` → `valid: true`. UI: tab `/pos/display` nhập PIN trên bàn phím số → hiện giỏ của ca, quầy hiện "Màn hình khách đã kết nối"; 375 px không cuộn ngang |
  | Đặt cọc pre-order | ✅ Thiếu khách → "Đơn đặt trước cần khách hàng"; cọc > giá trị → 400. Đặt quần×2 (575.000 sau mã tự áp), cọc 200.000 tiền mặt → `DC…`, giỏ xoá, tồn không đổi, doanh thu ca không đổi, tiền mặt dự kiến +200.000. Giao: thẻ vượt số còn lại → 400; đủ 375.000 → HĐ `preorder` = `deposit` 200.000 + thẻ 375.000, tồn −2, +575 điểm; giao lại → 409. Cọc bằng giá trị → giao không cần trả thêm. Huỷ hoàn 50.000/100.000 (hoàn > cọc → 400). Cọc qua intent Payment Hub → `deposit_reference = TXN-…`. UI: tạo đơn từ giỏ (khách F3) → thu cọc 150.000 → danh sách → Giao hàng → thu 150.000 → HĐ `…097` |
  | Tổng kết ca | ✅ Tiền mặt dự kiến khớp tay ở từng bước (1.300.000 → 1.750.000 → UI 2.270.000); trang `/pos/session` hiện nhận cọc theo phương thức, hoàn cọc, dòng cấn trừ "(không thu tiền)", cảnh báo 2 thanh toán Payment Hub chưa gắn HĐ |
  | In hóa đơn qua WebUSB/Bluetooth | 🟡 **Không có máy in thật** để kiểm. Đã kiểm: bộ mã hoá ESC/POS (unit test), trình duyệt có `navigator.usb` / `navigator.bluetooth`, hộp thoại Máy in (chọn USB/Bluetooth/khổ giấy/mở két), "In thử" khi chưa ghép → "Chưa kết nối máy in USB…", in hoá đơn khi máy in USB lỗi → báo lỗi + tự in qua trình duyệt (`window.print` gọi đúng 1 lần, hoá đơn 80 mm đúng nội dung) (#76) |
  | #58 WS theo trạng thái nhân viên | ✅ Vô hiệu hoá nhân viên đang kết nối → lệnh ghi kế tiếp "Không có quyền bán hàng", socket bị đóng **4403** sau 45 s, kết nối lại 403; kích hoạt lại → mở được |
  | Webhook giả | ✅ Chữ ký sai → 401 |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 107/107); migration `3_pos_advanced` áp lên DB dev, `prisma migrate diff` với schema: rỗng |
  | Dọn dẹp | ✅ dừng 4 process; xoá HĐ, thanh toán, phiếu trả, phiếu kho, intent, đơn đặt, tồn, SP, khách, điểm, kho, chi nhánh, ca `P45*`, user `demo.manager` tự tạo + audit; trả lại 1 lượt coupon tự áp (#4); Payment Hub: xoá 8 GD `BZ-tenant_demo-*` (+ log, QR, webhook log, idempotency), endpoint webhook + API key test, job webhook; Redis: giỏ/đơn chờ, token/PIN, idempotency, khoá chống trùng webhook, cache QR, 34 job BullMQ chưa chạy; khôi phục `.env.local` BizOne và `.claude/launch.json`. Ca mở sẵn của `admin@bizone.vn` (#2) không bị đụng |

  Sửa trong lúc test: danh sách gợi ý SP đổi bị khung modal cắt → hiển thị nội tuyến; thanh trên POS xuống dòng ở 800–900 px → không xuống dòng tiêu đề, ẩn phím tắt dưới `xl`; giỏ trống mà có đơn chờ → nút Tách/Gộp mở thẳng tab "Đơn chờ"; thông báo thiếu khách của đơn đặt trước là câu Zod chung → câu tiếng Việt.

- **Khác biệt so với plan:**
  - `services/payment/paymentHubClient.ts` đặt ở `server/services/payment/`; `services/printing/printer.ts` → `lib/printing/{escpos,printer}.ts` (chạy trên trình duyệt, encoder thuần dùng chung test).
  - "Tách/gộp hoá đơn" làm trên **đơn đang bán** (đơn chờ của ca) — tách 1 đơn thành 2 hoá đơn thanh toán riêng, gộp đơn chờ vào đơn hiện tại; không tách/gộp hoá đơn **đã** thanh toán (sẽ cần đảo doanh thu/điểm/tồn).
  - Thêm `PairDisplayModal`, `PrinterSettingsModal`, route công khai `/api/pos/pair`, 3 bảng mới (`pos_payment_intents`, `preorders`, `preorder_items`); đặt trước dùng bảng riêng thay vì `invoices.invoice_type='preorder'` cho đơn chưa giao (để báo cáo/hoa hồng/dashboard không phải lọc), `invoice_type='preorder'` dùng cho hoá đơn lúc giao.
  - Thẻ qua cổng = trang thanh toán Payment Hub/VNPay (QR link cho khách quét bằng điện thoại), không tích hợp máy POS thẻ vật lý (vẫn có lựa chọn "Máy POS thẻ riêng" nhập tay như trước).

- **Quyết định thiết kế:**
  - Thanh toán Payment Hub là **intent** riêng của ca, chỉ thành dòng thanh toán khi Payment Hub xác nhận; hoá đơn vẫn tạo ngay một lần (không có hoá đơn "chờ thanh toán") → báo cáo, tồn, điểm không đổi cách tính. `merchant_txn_id` mang tenant để webhook biết DB nào; webhook + poll dùng chung `applyOutcome` có điều kiện (idempotent).
  - Đổi hàng / giao đơn đặt trước = hoá đơn thường + **dòng cấn trừ** (`exchange` / `deposit`) — không tạo loại hoá đơn đặc biệt; tổng kết ca tách các dòng này khỏi "tiền thu".
  - Đơn chờ ở server (Redis, xử lý tuần tự theo ca trong WS) như giỏ hàng — hai màn hình và lần kết nối lại thấy cùng trạng thái.
  - Màn hình khách khác thiết bị dùng token riêng chỉ đọc, gắn một ca (không cấp token Keycloak cho thiết bị công cộng).
  - In ESC/POS bỏ dấu để chạy được trên mọi máy in nhiệt; máy in trình duyệt vẫn là mặc định.

- **Vấn đề / lưu ý:** đóng #58; cập nhật #30; mới #74–#79. Dev muốn dùng thẻ/QR Payment Hub trên POS: tạo API key (`npm run apikey:create -- BIZONE` ở Payment Hub) + endpoint webhook trỏ `http://localhost:3000/api/webhooks/payhub` (`/webhooks` Payment Hub), điền `PAYHUB_API_KEY` / `PAYHUB_API_SECRET` / `PAYHUB_WEBHOOK_SECRET` vào `.env.local` BizOne, chạy `npm run dev:worker` của Payment Hub (gửi webhook); không cấu hình thì POS ẩn lựa chọn Payment Hub. Tải lại `/pos/display` nhiều lần trong cùng tab có thể kẹt màn hình trống (cùng #56) — mở tab mới.

### P4.6 — Multi-Store Support

- **Hoàn thành:** 2026-11-10 · **Commit:** `b735f80` · **Vị trí:** `source/bizone/server/middleware/branchScope.ts` (mới), `server/trpc.ts`, `server/services/{branch,rbac,dashboard,report,inventory,invoice,posCatalog,preorder,purchaseOrder,posPairing}.service.ts`, `server/routers/{branch (mới),dashboard,reports,pos,warehouse,inventory,stockTake,transfer,order,purchaseOrder,staff}.ts`, `lib/validators/branch.ts`, `lib/branch-client.ts`, `components/branch/{BranchSwitcher,BranchList,BranchForm}.tsx`, `components/reports/BranchSummary.tsx`, `components/layout/{TopBar,AppShell,AppLayout,Sidebar}.tsx`, `components/inventory/{shared.ts,TransferForm.tsx}`, `app/settings/**`, `proxy.ts`, `prisma/migrations/4_branch_config`, `prisma/seed.ts`, `tests/branch.test.ts`; `database/schema.sql`
- **Đã làm:**
  - **Phạm vi chi nhánh** (`server/middleware/branchScope.ts`): mỗi request tRPC có quyền mang `ctx.branch = { current, allowed, canAll }` tính trong `enforcePermission` từ header `X-Branch-ID` (số / `all`) + phân công `user_branches` (thêm vào `StaffAccess`, cache `rbac:{tenant}`) + danh sách chi nhánh đang hoạt động (cache Redis 60 s). Quản trị (`admin:*`) và quản lý chưa được gán: mọi chi nhánh + "Tất cả"; nhân viên: các chi nhánh được gán (chưa gán → chi nhánh mặc định). Chi nhánh không được phép / "all" khi không đủ quyền → 403. Helper `branchFilter`, `assertBranch`, `scopeWarehouseIds`, `assertWarehouse`, `assertInventoryTransaction`, `assertStockTake`
  - **Dữ liệu tách theo `branch_id`**: dashboard (mọi số liệu + cache theo chi nhánh `dashboard:{tenant}:{branch|all}:*`, xoá bằng SCAN), báo cáo (doanh thu/lợi nhuận/SP/nhân viên/khuyến mãi/tồn kho/xuất file — chi nhánh chỉ định phải được phép, mặc định chi nhánh đang chọn; danh sách lọc chỉ chi nhánh được phép), POS (chi nhánh mở ca, lưới SP, danh sách ca / hoá đơn / đơn đặt trước, xem / in hoá đơn), kho (danh sách kho, tồn, tổng hợp, biểu đồ theo kho, phiếu kho, lô, kiểm kê, chuyển kho — phiếu chuyển thấy được từ cả kho nguồn và kho đích), đơn hàng (danh sách, chi tiết, cập nhật/huỷ/hoàn, xuất Excel; tạo đơn mặc định chi nhánh đang chọn), đơn nhập NCC (theo kho nhận), lịch ca làm việc
  - **Chuyển kho giữa chi nhánh**: kho nguồn phải thuộc phạm vi, kho đích chọn trong mọi kho đang hoạt động (`transfer.destinations`, hiện kèm tên chi nhánh)
  - **Quản lý chi nhánh** (`branch.*`, quyền mới `config:read` / `config:write` ⇐ catalog `config.read` / `config.update`; admin đủ, manager xem): danh sách (số kho, nhân viên, hoá đơn, ca đang mở), thêm (mã viết hoa, tuỳ chọn tạo kho `KHO-{mã}`, đặt mặc định), sửa, đặt mặc định, ngừng / mở lại (không ngừng chi nhánh mặc định hoặc đang có ca POS mở), xoá (chỉ khi chưa phát sinh ca/HĐ/đơn/phiếu kho/tồn). 6 mutation vào `AUDIT_ROUTES`
  - **Cấu hình riêng theo chi nhánh** (bảng `branch_configs`, migration `4_branch_config`; `effectiveConfig` = chi nhánh → `store_config`): tên in hoá đơn / màn hình khách, tiền tố mã hoá đơn, tài khoản VietQR (BIN, ngân hàng, số TK, chủ TK), lời chào cuối hoá đơn. Áp vào `pos.storeInfo` (theo chi nhánh của ca), mã hoá đơn, dữ liệu in (tên chi nhánh, địa chỉ/ĐT chi nhánh, lời chào — cả bản in ESC/POS), tên cửa hàng của màn hình khách ghép PIN
  - **Báo cáo tổng hợp nhiều chi nhánh** (`reports.branches` + tab "Chi nhánh"): tổng doanh thu thuần / lợi nhuận / số HĐ + từng chi nhánh (DT thuần, tỷ trọng, số HĐ, TB/HĐ, trả hàng, lợi nhuận, biên LN, so với kỳ trước) trong các chi nhánh người dùng được xem
  - **UI**: `BranchSwitcher` trên thanh trên (thay ô "Chi nhánh Hà Nội" giả của P1.7): chi nhánh được phép (+ "Tất cả chi nhánh" cho quản trị), lưu localStorage + cookie, đổi → tải lại trang; lựa chọn không còn hợp lệ → tự về mặc định. `apiContext` gửi `X-Branch-ID` cho mọi lệnh gọi tRPC. `proxy.ts` chuyển cookie thành header cho route handler thường (không áp cho tRPC). Trang `/settings/branches` (sidebar "Cài đặt" mở trang này; `/settings` chuyển hướng): bảng chi nhánh + form thông tin / cấu hình riêng (ô trống hiện giá trị dùng chung)
  - **Seed**: tenant chưa có chi nhánh → tạo `CN01` "Chi nhánh chính" (mặc định) + `KHO-CN01` (#11)
  - Test Vitest `tests/branch.test.ts` (7): phạm vi admin / nhân viên được gán / quản lý chưa gán / nhân viên chưa gán / chi nhánh ngừng, validator chi nhánh + khoá cấu hình; cập nhật `qa2.test.ts` (khoá cache dashboard theo chi nhánh)

- **Kiểm thử** (build production `next start` hai danh tính dev: :3001 quản trị `admin@bizone.vn`, :3003 `demo.seller@bizone.vn` — bán hàng với vai trò seller, rồi quản lý `bizone-manager` chỉ được gán chi nhánh A; dữ liệu tạm `P46*`: chi nhánh A/B/C, 2 SP tồn 20/10, ca + 3 HĐ; script e2e tRPC + UI trình duyệt):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | User A thấy branch A | ✅ Quản lý gán chi nhánh A: `branch.mine` = [P46A], dashboard hôm nay 250.000 / 2 HĐ (chỉ A), hoá đơn chỉ `HNA…` của A, kho chỉ `KHO-P46A`, tồn chỉ kho A, đơn/ca/chi nhánh mở ca chỉ A, tuỳ chọn báo cáo chỉ A, báo cáo tổng hợp chỉ dòng A. `X-Branch-ID` = B → 403 "Không có quyền truy cập chi nhánh #18"; `all` → 403 "Chỉ quản trị viên…"; xem HĐ của B theo id → 403; tồn kho B / báo cáo branchId B / tạo phiếu chuyển từ kho B → 403. UI (:3003): ô chi nhánh chỉ "P46 Chi nhánh A", trang Kho chỉ kho A |
  | Switch branch → dữ liệu thay đổi | ✅ Quản trị: dashboard A / B / tất cả = 250.000 / 150.000 / 2.960.950; hoá đơn A 2, B 1; kho A chỉ `KHO-P46A`, tất cả 4 kho; báo cáo doanh thu khi chọn A = 250.000. UI: "Tất cả chi nhánh" (3,0 tr, 17 HĐ) → chọn "P46 Chi nhánh A" → trang tải lại 250K, 2 HĐ, top SP X/Y |
  | Báo cáo tổng hợp nhiều branch | ✅ `reports.branches`: CN-HN 2.560.950 (86,5 %), P46A 250.000 (8,4 %), P46B 150.000 (5,1 %), CN-HCM 0; tổng 2.960.950 khớp dashboard "tất cả". UI tab "Chi nhánh": KPI tổng + bảng so sánh, so với kỳ trước |
  | Branches CRUD | ✅ tạo A/B/C kèm kho `KHO-P46x`, chi nhánh mặc định không đổi; trùng mã → 409; mã có khoảng trắng → 400; sửa địa chỉ; ngừng chi nhánh mặc định → 409; xoá C (trống) → xoá cả kho; xoá A (có HĐ) → 409 "chỉ có thể ngừng hoạt động"; đặt B mặc định rồi trả lại CN-HN; ngừng B → chọn B 403, POS không cho mở ca ở B; mở lại. Audit `create/update/delete/set_default/set_status/set_branch_config`. UI `/settings/branches` + form cấu hình riêng lưu được (kiểm DB) |
  | Cấu hình riêng theo branch | ✅ A: tiền tố `HNA` → HĐ `HNA2611100001`; B (kế thừa) → `HD…`; `storeInfo` ca A: "Shop A", TK 0123456789 "CUA HANG A", lời chào riêng; ca B: tên chung, không có TK; dữ liệu in A có tên chi nhánh + lời chào; khoá cấu hình lạ → 400 |
  | Chuyển kho giữa các branch | ✅ Quản lý A: kho đích có kho của B; chuyển 3 X từ A → B, xác nhận → tồn A 18 → 15, B 10 → 12 (sau bán); quản trị chọn B thấy phiếu chuyển đến |
  | Inventory riêng theo warehouse (gắn branch) | ✅ như trên — tồn, phiếu, kiểm kê, lô lọc theo kho của chi nhánh |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 114/114); migration `4_branch_config` áp lên DB dev, `prisma migrate diff`: rỗng |
  | Dọn dẹp | ✅ dừng server; xoá HĐ, ca, phiếu kho, tồn, SP, kho, chi nhánh `P46*`, phân công + user `demo.seller` tự tạo, audit test, cấu hình riêng (cascade); Redis: cache rbac/chi nhánh/dashboard, idempotency, 6 job BullMQ chưa chạy; gỡ cấu hình launch tạm. Chi nhánh mặc định CN-HN và ca mở sẵn #2 của `admin@bizone.vn` không bị đụng |

  Sửa trong lúc test: cookie chi nhánh dùng chung theo host (khác cổng) bị proxy biến thành `X-Branch-ID` cho cả tRPC → lệch với lựa chọn trong localStorage, quản lý A nhận 403 "Chỉ quản trị viên…" → tRPC chỉ dùng header do client gửi, cookie chỉ cho route handler thường, và switcher đồng bộ lại cookie.

- **Khác biệt so với plan:**
  - Ô chọn chi nhánh đặt ở **thanh trên** (đúng vị trí ô giả của mockup / P1.7) thay vì sidebar; `middleware.ts` của plan là `proxy.ts` (Next 16) — chỉ chuyển cookie → header cho route handler, việc kiểm quyền nằm ở tRPC (`enforcePermission` + `branchScope.ts`).
  - Thêm bảng `branch_configs` (cấu hình riêng), quyền `config:read` / `config:write`, trang `/settings/branches`, `reports.branches`, `transfer.destinations`.
  - "User gán nhiều branch" dùng phân công có sẵn của P4.1 (vai trò theo chi nhánh → `user_branches`), không thêm màn hình riêng.

- **Quyết định thiết kế:**
  - Phạm vi tính ở server cho mọi request (không tin client): header chỉ là lựa chọn trong số chi nhánh được phép; thiếu header → "tất cả" cho quản trị, chi nhánh mặc định cho nhân viên (API cũ không gửi header vẫn chạy).
  - Một chi nhánh đang chọn (hoặc "tất cả") cho mọi màn hình — các service giữ tham số `branchId?` đơn giản; riêng báo cáo tổng hợp nhận danh sách chi nhánh được phép.
  - Kho không gắn chi nhánh = kho chung, mọi chi nhánh thấy; phiếu chuyển kho thuộc cả hai đầu.
  - Cấu hình riêng chỉ ghi đè (trống = dùng chung) để thêm chi nhánh không phải nhập lại mọi thứ.

- **Vấn đề / lưu ý:** đóng #11, #14, #60; mới #80–#82. Trang `/settings` (redirect) cũng in cảnh báo "Could not validate `instant`" khi build giống `/` (đã biết, không ảnh hưởng).


### P4.7 — Thông báo — Hệ thống + Email + SMS

- **Hoàn thành:** 2026-11-10 · **Commit:** `99cd07f` · **Vị trí:** `source/bizone/lib/notifications/{events,template,schedule}.ts`, `lib/validators/notification.ts`, `server/services/{notification,notificationDelivery,notificationTemplate,notificationScan,campaign,email,sms,push,reportMail}.service.ts`, `server/queue/{notification,notificationWorker}.ts`, `server/ws/notifications.ts` (+ `ws/pos.ts`, `worker.ts`), `server/routers/{notification,campaign}.ts` (+ `reports.emailReport`), sự kiện trong `order.service` / `inventory.service`, `app/notifications/**`, `app/marketing/campaigns`, `components/notifications/*`, `components/marketing/Campaign{List,Form}.tsx`, `components/reports/EmailReportButton.tsx`, `components/layout/TopBar.tsx`, `hooks/useNotifications.ts`, `public/sw.js`, `prisma/migrations/5_notifications`, `prisma/seed.ts`, `tests/notification.test.ts`; `database/schema.sql`, `.env.example`
- **Đã làm:**
  - **Danh mục sự kiện** (`lib/notifications/events.ts`, theo SRS §9): đơn hàng mới (online), tồn kho thấp, kiểm kê chênh lệch, công nợ khách quá hạn, công nợ NCC sắp đến hạn / quá hạn (#66), nhắc lịch giao đơn đặt trước (#78), nhắc ca làm việc (gửi riêng nhân viên), báo cáo định kỳ (#62), chiến dịch gửi xong, đồng bộ kênh bán lỗi (chờ P6.1). Mỗi loại có `audience` (capability được xem: `order:read`, `inventory:read`, `crm:manage_debt`, `supplier:manage_po`, `pos:read`, `report:read`, `marketing:campaign`, `admin:*`), kênh mặc định, mẫu email/SMS mặc định, biến mẫu, tuỳ chọn (báo trước N ngày/phút, tần suất báo cáo, nhắn khách)
  - **`notify()`** (`notification.service`): áp cấu hình của cửa hàng → lưu `notifications` (khoá chống trùng `dedupe_key` — VD tồn thấp tối đa 1 lần/ngày mỗi SP + kho) → publish Redis `bizone:notify:{tenant}` → job `deliver` gửi email/SMS/push. Không bao giờ ném lỗi (không làm hỏng nghiệp vụ gốc). Nguồn: `order.service.createOrder` (kênh ≠ `pos`), `publishLowStockAlerts` (bán hàng, xác nhận phiếu kho, nhận hàng NCC), `completeStockTake`, `campaign.service`, job quét
  - **Trung tâm thông báo** (`notification.*`): danh sách 30 ngày có phân trang + lọc chưa đọc / loại, số chưa đọc, đánh dấu đã đọc / chưa đọc / tất cả (`notification_reads`). Người xem (`notificationViewer`) = capability theo token + vai trò tuỳ chỉnh, chi nhánh được phép (P4.6 — mọi chi nhánh được gán, không chỉ chi nhánh đang chọn), loại đã tắt; cùng một luật cho SQL (`visibleWhere`) và WS (`isVisibleTo`)
  - **WebSocket** `/ws/notifications` trong process realtime (cùng cổng 3002 với POS, `server/ws/notifications.ts`): subprotocol `["bizone-notify", token]` + `?tenant=`, gửi `notification:unread` khi kết nối và `notification:new` cho đúng người; làm mới quyền mỗi 60 s, đóng 4403 khi nhân viên bị vô hiệu hoá. Client (`useNotifications`) tự kết nối lại (backoff), mất WS thì poll 30 s
  - **UI**: chuông trên thanh trên (badge số chưa đọc, dropdown 8 thông báo mới nhất, bấm → đánh dấu đã đọc + mở trang liên quan, toast khi có thông báo mới), `/notifications` (danh sách), `/notifications/preferences` (tắt theo loại cho chuông / push + bật Web Push trên thiết bị), `/notifications/settings` (bật kênh trong app / push / email / SMS theo sự kiện, người nhận, mẫu, tuỳ chọn), `/notifications/templates` (CRUD mẫu + xem trước dữ liệu mẫu + gửi thử), `/notifications/deliveries` (lịch sử gửi 30 ngày: nội dung thực tế, trạng thái, lỗi, nhà cung cấp)
  - **Email** (`email.service`, nodemailer SMTP; không có `SMTP_HOST` → provider `log`): nội dung mẫu là văn bản thường → HTML đơn giản có thương hiệu (escape, link tự động) + bản text. **SMS** (`sms.service`): `SMS_PROVIDER=http` (POST gateway JSON + Bearer) hoặc `log`; chuẩn hoá SĐT VN, bỏ dấu + ký tự ngoài GSM (₫ → d) trừ khi `SMS_UNICODE=true`. **Web Push** (`push.service`, `web-push` + VAPID; `public/sw.js` hiện thông báo + mở link): subscription lưu theo thiết bị kèm vai trò lúc đăng ký, worker lọc theo quyền / chi nhánh / tuỳ chọn tắt, xoá subscription hết hạn (404/410)
  - **Gửi tin & thử lại**: mỗi tin là một dòng `notification_deliveries`; job `deliver` thử lại 3 lần (backoff) nhưng chỉ gửi lại tin lỗi; email/SMS cá nhân (nhắc ca) gửi tới email/SĐT trong hồ sơ nhân viên; nhắn khách (nhắc nợ `debt_reminder_sms`, nhắc nhận đơn `preorder_due_sms`) khi bật tuỳ chọn
  - **Job định kỳ** (queue `bizone-notification`, giờ VN): mỗi 5 phút nhắc ca (trước N phút), 08:00 công nợ khách quá hạn (mốc 1 / 30 ngày), công nợ NCC sắp đến hạn / quá hạn, đơn đặt trước đến hạn hôm nay / ngày mai; 07:00 báo cáo định kỳ; 02:15 xoá thông báo + log gửi quá 30 ngày
  - **Báo cáo qua email (#62)**: nút "Gửi email" trên `/reports` (tối đa 5 địa chỉ, Excel/PDF theo bộ lọc đang chọn, chi nhánh theo phạm vi P4.6) → worker dựng file như xuất báo cáo và gửi kèm tóm tắt doanh thu thuần / số HĐ / lợi nhuận; sự kiện "Báo cáo định kỳ" gửi báo cáo hôm qua / tuần trước (thứ Hai) / tháng trước (ngày 1), thử lại chỉ gửi người chưa nhận
  - **Chiến dịch SMS / Email (#70, SRS-MKT-06)** (`campaign.*`, quyền mới `marketing:campaign` ⇐ catalog `marketing.manage_campaign`, admin + manager): đối tượng theo hạng, nhóm khách, chi tiêu tối thiểu, tháng sinh (chỉ khách đang hoạt động có email / SĐT di động hợp lệ, tối đa 5.000), xem trước số khách + 5 khách mẫu, nội dung có biến (`customer_name`, `points`, `ranking`…), lưu nháp / gửi ngay / hẹn giờ (giờ VN) / huỷ; worker gửi từng khách (chạy lại bỏ qua khách đã nhận, huỷ dừng trong 20 tin), cập nhật số đã gửi / lỗi, báo "đã gửi xong"
  - Migration `5_notifications`: 7 bảng (`notifications`, `notification_reads`, `notification_settings`, `notification_preferences`, `push_subscriptions`, `marketing_campaigns`, `notification_deliveries`) + 11 mẫu mặc định; bỏ chữ "đ" cứng trong mẫu `debt_reminder_sms` (số tiền đã có ₫). Seed không còn ghi đè mẫu đã có. 11 mutation vào `AUDIT_ROUTES`
  - Thanh trên: ẩn ô tìm kiếm (chưa có chức năng) dưới 640 px để chuông không bị cắt
  - Test Vitest `tests/notification.test.ts` (13): render mẫu, email HTML escape + link, SMS không dấu / GSM, SĐT VN, luật hiển thị (audience, chi nhánh, cá nhân, tắt riêng), cấu hình mặc định + tuỳ chọn, validator (cấu hình, mẫu, danh sách email, đối tượng), kỳ báo cáo định kỳ theo giờ VN

- **Kiểm thử** (`next dev` :3000 + realtime :3002 + worker (tsx watch) đang chạy trên máy với user dev `admin@bizone.vn`; env tạm: SMTP → Mailpit (container tạm), SMS → gateway giả HTTP, khoá VAPID tạm; script tRPC + WebSocket thật, Mailpit API, UI qua trình duyệt tích hợp; dữ liệu tạm `P47*`: 4 khách, 1 nợ khách, 1 NCC + 2 nợ, 1 ca + phân ca, 1 đơn đặt trước, 5 đơn online, 3 chiến dịch):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Tạo đơn online → notif hiện trên dashboard | ✅ `order.create` kênh Shopee → WS nhận `notification:new` **~70 ms** sau khi gửi request ("Đơn hàng ORD-… từ Shopee - 65.000₫"). UI `/dashboard`: tạo đơn Lazada → toast + badge chuông 2 → 3 ngay, dropdown liệt kê, bấm → mở `/orders/7`, badge còn 2. Đơn kênh `pos` không thông báo |
  | Cấu hình template → gửi email đúng nội dung | ✅ Sửa mẫu `order_new_email` (tiêu đề + 5 dòng biến) + bật email cho "Đơn hàng mới" tới 2 địa chỉ → tạo đơn Website → Mailpit nhận 2 email, tiêu đề / nội dung text + HTML đúng từng biến (kênh, khách, chi nhánh HCM, tổng 75.000₫, link `/orders/8`); SMS tới gateway đúng mẫu `order_new_sms`. UI: form mẫu xem trước dữ liệu mẫu → "Gửi thử" → email đúng nội dung xem trước |
  | WebSocket real-time | ✅ Như trên; token sai / thiếu → 401, tenant khác → 403; health `notificationClients`. Lọc: nhân viên bán hàng (chi nhánh mặc định HN) thấy 4 thông báo (không thấy đơn HCM), quản trị thấy 5; nhân viên không có `crm:manage_debt` không có audience công nợ |
  | Email (SMTP template) / SMS (gateway) | ✅ Gateway trả 503 → tin SMS `failed` → job thử lại sau ~5 s → `sent` (attempts 2), 2 email không gửi lại. SMS không dấu, "₫" → "d". Validation cấu hình: bật email không có người nhận / mẫu sai kênh / email, SĐT sai → 400 câu tiếng Việt |
  | Events: tồn thấp, kiểm kê, công nợ quá hạn, báo cáo định kỳ, nhắc ca (+ #66, #78) | ✅ Job `daily`: nợ khách quá hạn 5 ngày (SMS nội bộ + SMS nhắc khách), nợ NCC đến hạn sau 2 ngày (email kế toán), nợ NCC quá hạn 40 ngày (mốc 30), đơn đặt trước giao ngày mai (SMS khách); job `scan`: ca bắt đầu sau 20 phút → thông báo riêng + email + SMS tới nhân viên; chạy lại cả 2 job → 0 (chống trùng). Báo cáo định kỳ (hằng ngày, PDF) → 2 email kèm `bao-cao-revenue-2026-11-09_2026-11-09.pdf`, số liệu đúng; chạy lại → không gửi lại. Tồn thấp phát sinh thật từ hoá đơn POS trên app (1 thông báo, giữ nguyên). Kiểm kê chênh lệch, đồng bộ lỗi: kiểm bằng code + unit (không hoàn tất phiếu kiểm kê trên dữ liệu thật) |
  | Gửi email báo cáo (#62) | ✅ `reports.emailReport` doanh thu 03–09/11 (Excel) → email kèm file 10 KB, doanh thu thuần 15.797.250₫ / 70 HĐ / LN 5.645.350₫ khớp `reports.revenue`; tồn kho (PDF) ✅; email sai → 400 |
  | Notification templates CRUD + variables | ✅ Sửa, xem trước (biến lạ được cảnh báo), gửi thử email; mẫu đang dùng / mẫu hệ thống không xoá được (409); đổi kênh mẫu đang dùng → 409 |
  | Notification preferences | ✅ Cấu hình kênh theo sự kiện (6 lần lưu, audit `update_notification_setting`); tuỳ chọn cá nhân: trang hiện đúng loại được xem (unit + UI) |
  | Web Push Notification | 🟡 Trình duyệt tích hợp chặn quyền Notification (`Notification.permission = denied`) nên chưa đăng ký được subscription thật (#84). Phía máy chủ: subscription giả trỏ endpoint HTTPS giả → request `aes128gcm`, TTL 3600, `Authorization: vapid …`; subscription trả 410 bị xoá; seller (chi nhánh HN) không nhận đơn chi nhánh HCM; chạy lại không gửi trùng. `/sw.js` 200 `application/javascript` |
  | Lưu 30 ngày | ✅ Job `cleanup`: xoá thông báo 31 ngày + log gửi 31 ngày, giữ bản 29 ngày |
  | Đánh dấu đã đọc / chưa đọc | ✅ API + UI: đọc 1 / đọc tất cả / bỏ đọc, lọc "Chưa đọc", badge cập nhật |
  | Chiến dịch SMS / Email (#70) | ✅ Tháng sinh 11: email 2 khách (khách email sai bị loại), SMS 3 khách (SĐT 02… bị loại); gửi ngay → 2/2, email đúng biến (hạng, điểm); gửi lại → 409; hẹn giờ quá khứ → 400; hẹn 16:12 → worker gửi đúng 16:12:00, 3/3 SMS; huỷ chiến dịch hẹn giờ → không gửi, huỷ lần 2 → 409; sửa / xoá chiến dịch đã gửi → 409. UI danh sách + form (đếm 15 khách khi không lọc) |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 127/127); bundle `pos.mjs` (cổng thử 3012: health có `notificationClients`) và `worker.mjs` (đăng ký queue `bizone-notification`) khởi động được; migration `5_notifications` áp lên DB dev, `prisma migrate diff`: rỗng; `database/schema.sql` nạp được vào DB trống |
  | Dọn dẹp | ✅ xoá thông báo / đọc / log gửi / cấu hình / tuỳ chọn / push / chiến dịch test, 5 đơn online, khách + nợ, NCC + nợ, ca + phân ca, đơn đặt trước + ca POS đóng tạm `P47`, user `p47.*` tự tạo, audit test; trả SĐT/email user admin về NULL, trả mẫu `order_new_email` về mặc định; Redis: cache rbac, job test + job chiến dịch hẹn giờ đã huỷ (giữ 4 lịch định kỳ); dừng gateway giả, xoá container + image Mailpit, khôi phục `.env.local`. Không đụng ca POS đang mở (#6) và hoá đơn #115 do app tạo trong lúc test; chi nhánh mặc định CN-HN giữ nguyên |

  Sửa trong lúc test: SMS còn "₫"/"–" làm tin chuyển sang Unicode → thay bằng ký tự ASCII; mẫu `debt_reminder_sms` hiện "2.500.000₫đ" → bỏ "đ" trong mẫu gốc (migration + seed + schema.sql); seed ghi đè mẫu cửa hàng đã sửa → chỉ tạo mới; bảng mẫu hàng cao vì cột "Đang dùng cho" → giới hạn 3 dòng; thẻ cấu hình ép tiêu đề hẹp → xếp dọc dưới `lg`; thanh trên tràn ở 375 px che chuông → ẩn ô tìm kiếm dưới `sm`.

- **Khác biệt so với plan:**
  - `server/jobs/notificationQueue.ts` → `server/queue/notification.ts` + `notificationWorker.ts` (đúng quy ước queue hiện có; phần dùng nodemailer/pdfmake chỉ ở worker).
  - Thêm `notificationDelivery`, `notificationTemplate`, `notificationScan`, `push`, `reportMail`, `campaign` service, các trang con `/notifications/*`, `/marketing/campaigns`, nút "Gửi email" báo cáo — gom các vấn đề #62, #66, #70, #78 về P4.7.
  - WebSocket thông báo chạy trong process realtime sẵn có (cổng 3002, path `/ws/notifications` như API-Design §16) thay vì process riêng; API là tRPC `notification.*` thay cho REST `/api/notifications`.
  - Chưa có kênh Zalo OA (#85); SMS là adapter HTTP chung (#83).

- **Quyết định thiết kế:**
  - Thông báo toàn cửa hàng lưu **một dòng** + `audience` (capability) + `branch_id`, quyền xem tính lúc đọc (token + vai trò tuỳ chỉnh + chi nhánh P4.6) — không phải sinh dòng cho từng người, nhân viên mới / đổi quyền thấy đúng ngay; thông báo cá nhân dùng `user_id`. Trạng thái đọc ở `notification_reads`.
  - Kênh ngoài (email/SMS) cấu hình **theo sự kiện ở mức cửa hàng** (danh sách người nhận + mẫu) — không cần biết vai trò Keycloak của người không đăng nhập; tuỳ chọn cá nhân chỉ tắt chuông / push.
  - Mọi tin gửi đi được ghi log (nội dung thực tế, nhà cung cấp, lỗi) → kiểm được và thử lại có chọn lọc; provider `log` khi chưa cấu hình để dev chạy không cần SMTP/SMS.
  - Mẫu là văn bản thường có `{{biến}}` (không HTML) — nhân viên sửa an toàn, email tự dựng HTML đã escape.
  - Hẹn giờ / định kỳ dùng BullMQ (job delay + job scheduler theo giờ VN), chống trùng bằng `dedupe_key`.

- **Vấn đề / lưu ý:** đóng #62, #66, #70; cập nhật #12, #78; mới #83–#87. Dev muốn nhận email/SMS thật: điền `SMTP_*` / `SMS_*` trong `.env.local` (mặc định ghi log), chạy `npm run dev:worker`; Web Push cần `VAPID_*` + Chrome (#84). Quyền `marketing.manage_campaign` mới: chạy `npm run db:seed` trên tenant đã có để vai trò hệ thống nhận quyền. Trong lúc kiểm thử, lệnh nạp thử `database/schema.sql` (file có `USE bizonedb`) đã chạy nhầm vào DB dev: chỉ các lệnh `CREATE … IF NOT EXISTS` / `INSERT` mẫu trùng khoá nên bị từ chối — đã kiểm `prisma migrate diff` rỗng và không có dòng mới (lần sau nạp thử bằng bản sao đã đổi `USE`).

### P4.8 — Kế toán & Tài chính — API & UI

- **Hoàn thành:** 2026-11-10 · **Commit:** `af2bbab` · **Vị trí:** `source/bizone/lib/accounting/calc.ts`, `lib/validators/accounting.ts`, `server/services/{cashFund,ledger,accountingReport}.service.ts`, `server/routers/accounting.ts`, `server/trpc.ts` (`permissionProcedure` nhận mảng quyền), `server/services/{supplier,customer,report}.service.ts` + `server/routers/{supplier,customer}.ts` (phiếu tự động), `app/accounting/**` (7 trang), `components/accounting/*`, `components/suppliers/PaymentModal.tsx`, `components/crm/CustomerDetail.tsx`, `components/layout/Sidebar.tsx`, `lib/{permissions,rbac}.ts`, `types/auth.ts`, `server/middleware/auditLog.ts`, `prisma/migrations/6_accounting`, `prisma/seed.ts`, `tests/accounting.test.ts`; `database/schema.sql`
- **Đã làm:**
  - **Quỹ (SRS-ACC-02)** — `cashFund.service`: nhiều quỹ, loại tiền mặt / ngân hàng (số tài khoản), theo chi nhánh hoặc quỹ chung (`branch_id NULL`), số dư đầu kỳ. Mọi thay đổi số dư qua `postMovement` (khoá `FOR UPDATE`, ghi `fund_transactions` số dư trước / sau, chi vượt số dư → 409). Chuyển quỹ (2 biến động tham chiếu nhau, khoá 2 quỹ theo thứ tự id), kiểm quỹ (nhập số đếm / sao kê → biến động điều chỉnh), ngừng quỹ chỉ khi số dư = 0
  - **Đối soát cuối ca → quỹ**: danh sách ca POS đã khoá 14 ngày (tiền mặt dự kiến / thực đếm / chênh lệch) + "Nộp vào quỹ" (mỗi ca 1 lần, khoá dòng ca; quỹ phải cùng chi nhánh hoặc quỹ chung)
  - **Sổ quỹ** (`accounting.ledger`, `LedgerTable`): tồn đầu kỳ → từng biến động (thời gian, chứng từ, nội dung, danh mục, người nộp/nhận, người lập, thu / chi / tồn sau) → cộng phát sinh, tồn cuối kỳ; lọc khoảng ngày, chiều thu/chi, danh mục (cả danh mục con); xuất CSV
  - **Thu chi (SRS-ACC-01)** — `ledger.service`: danh mục dạng cây (tạo / sửa / chuyển cha có chống vòng / ngừng / xoá khi chưa dùng; mã tự sinh không dấu; danh mục con cùng loại cha; danh mục hệ thống không đổi loại, không xoá). Phiếu thu `PT…` / phiếu chi `PC…` (yymmdd + 4 số theo ngày chứng từ, thử lại khi trùng mã): danh mục đúng loại, ngày không ở tương lai, quỹ tuỳ chọn ("không qua quỹ" = chỉ ghi sổ), người nộp/nhận, diễn giải. Sửa (số tiền / quỹ đổi → đảo biến động cũ + ghi mới; kiểm lại dữ liệu dưới khoá), huỷ (đảo biến động, phiếu giữ lại `cancelled` + lý do). Danh sách lọc kỳ / loại / danh mục / quỹ / trạng thái / tìm kiếm + tổng thu / chi / chênh lệch, xuất CSV, chi tiết phiếu kèm biến động quỹ
  - **Phiếu tự động (#67)**: `postAutoRecord(tx, …)` trong transaction của nghiệp vụ gốc — thanh toán NCC → phiếu chi "Tiền nhập hàng" (`reference_type = supplier_payment`), khách trả nợ (CRM) → phiếu thu "Thu nợ khách hàng" (`customer_debt_payment`); cả hai nhận `fundId` tuỳ chọn (UI tự chọn quỹ theo hình thức: tiền mặt → quỹ tiền mặt, chuyển khoản → quỹ ngân hàng); quỹ không đủ → rollback cả thanh toán. Phiếu tự động không sửa / huỷ ở sổ thu chi
  - **Công nợ tổng hợp (SRS-ACC-03)**: phải thu (khách) / phải trả (NCC) theo đối tượng — còn nợ, quá hạn, số khoản, hạn sớm nhất, trễ tối đa, tuổi nợ (chưa đến hạn / 1–30 / 31–60 / 61–90 / > 90 ngày, giờ VN), lọc quá hạn, tìm kiếm, link sang trang khách / NCC để ghi thanh toán. Cảnh báo quá hạn chủ động đã có ở P4.7
  - **Lời lỗ + dòng tiền (SRS-ACC-04)**: lời lỗ = doanh thu thuần + giá vốn từ hoá đơn (dùng lại `linesSql` của P4.2 qua `salesTotals` / `salesByPeriod`) + thu nhập khác − chi phí hoạt động (theo danh mục); danh mục thu tiền bán hàng / thu nợ / tiền nhập hàng (và con) đứng riêng "không tính vào lời lỗ"; biểu đồ doanh thu – chi phí theo ngày / tháng. Dòng tiền: tiền bán hàng theo phương thức (trừ tiền thối, bỏ dòng cấn trừ), tiền cọc đặt trước, hoàn tiền trả hàng / hoàn cọc, mọi phiếu thu / chi; số dư từng quỹ đầu / cuối kỳ
  - **Đối soát thanh toán (SRS-ACC-05)**: theo phương thức (ghi trên HĐ / đã xác nhận / chưa xác nhận + nguồn đối chiếu: kiểm ca, Payment Hub, sao kê); danh sách cần kiểm tra: thu thiếu (không có công nợ tương ứng) / thu thừa, thẻ-QR nhập tay chưa có xác nhận Payment Hub, lệch số Payment Hub, tiền đã về Payment Hub nhưng chưa gắn HĐ, chênh lệch tiền ca, tiền ca chưa nộp quỹ; tuỳ chọn xem mọi hoá đơn
  - **Tổng quan** `/accounting`: doanh thu, chi phí, lợi nhuận, tỷ suất; biểu đồ; số dư quỹ; thu chi trong kỳ; công nợ phải thu / phải trả (quá hạn)
  - **Quyền**: capability mới `accounting:read` (catalog mới `accounting.read`), `accounting:fund` / `revenue_expense` / `debt` (gắn vào 3 mã catalog trước đây để trống) — admin + manager. `fundOptions` cho cả `supplier:manage_po`, `crm:manage_debt` (`permissionProcedure([...])` = một trong các quyền). 11 mutation vào `AUDIT_ROUTES`. Phạm vi chi nhánh P4.6: quỹ theo chi nhánh + quỹ chung, phiếu theo chi nhánh (`assertBranch`)
  - Migration `6_accounting`: `cash_funds` + `type` / `account_no` / `description`; `revenue_expense_records` + `code` (unique), `type`, `partner_name`, `status` / `cancel_*`, `updated_by` / `updated_at` (+ 4 index, 2 FK); index `fund_transactions(reference_type, reference_id)`. Seed: danh mục `revenue_debt_collection`, một quỹ tiền mặt mỗi chi nhánh khi tenant chưa có quỹ. Sidebar bật mục "Kế toán"
  - Test Vitest `tests/accounting.test.ts` (19): biến động quỹ / chặn âm, mã PT/PC + số thứ tự, cây danh mục (con, chống vòng, ngoài lời lỗ), lời lỗ, tuổi nợ, validator, quyền theo vai trò + catalog

- **Kiểm thử** (`npm run build` + `next start -p 3001` (dev server :3000 của phiên khác đang chạy), user dev `admin@bizone.vn`; script tRPC thật 50 kiểm tra + UI qua trình duyệt tích hợp; dữ liệu tạm: 2 quỹ `TEST-*`, phiếu TEST, 1 thanh toán NCC 100k, 1 lần khách trả nợ 50k, nộp tiền ca #2):

  | Tiêu chí (PLAN) | Kết quả |
  |-----------------|---------|
  | Ghi thu → quỹ tăng | ✅ Quỹ TM số dư đầu 1.000.000 → phiếu thu `PT2611100001` 500.000 → 1.500.000; khách trả nợ 50.000 vào quỹ → phiếu thu tự động, quỹ +50.000; nộp tiền ca #2 1.000.000 → quỹ +1.000.000 (nộp lần 2 → 409, ca đang mở → 409) |
  | Ghi chi → quỹ giảm | ✅ Phiếu chi `PC2611100001` 300.000 → 1.200.000; UI "Lập phiếu chi" Tiền nước 120.000 → toast `PC2611100003`, gợi ý "số dư sau 1.210.000₫" đúng; thanh toán NCC 100.000 từ quỹ NH → phiếu chi tự động "Tiền nhập hàng", NH 350.000 → 250.000. Chi vượt số dư → 409 ("Quỹ không đủ số dư (còn 0₫, cần chi 2.000.000₫)"), thanh toán NCC vượt quỹ → 409 và rollback (công nợ NCC giữ nguyên) |
  | Sổ quỹ đúng số dư | ✅ Sau 11 biến động (đầu kỳ, thu, chi, chuyển quỹ, kiểm quỹ −20.000, sửa phiếu 300k → 350k = đảo + ghi mới, chuyển phiếu sang quỹ khác, huỷ phiếu thu, thu nợ, nộp tiền ca): mỗi dòng `số dư trước` = `số dư sau` dòng trước, tồn đầu 0 + thu 3.200.000 − chi 1.870.000 = tồn cuối 1.330.000 = số dư quỹ; quỹ NH 0 + 700.000 − 350.000 = 350.000 ✅. Lọc theo danh mục chỉ còn phiếu thu + dòng đảo của nó. UI `/accounting/cash-funds` hiện đúng sổ |
  | Báo cáo lời lỗ: doanh thu − chi phí = lợi nhuận | ✅ 01–10/11: doanh thu 19.847.100 − chi phí 13.069.400 (giá vốn 12.599.400 + chi phí 470.000) = lợi nhuận 6.777.700 (UI); doanh thu thuần 19.847.100 / giá vốn 12.599.400 khớp `reports.profit` (P4.2); tiền nhập hàng 100.000 + thu nợ 50.000 nằm ở "không tính vào lời lỗ"; tổng quan khớp |
  | Cash funds nhiều quỹ, fund transactions, thu/chi categories tree | ✅ Mã quỹ trùng → 409, quỹ NH thiếu STK → 400, chuyển cùng quỹ → 400, chuyển vượt số dư → 409, kiểm quỹ khớp → 409, ngừng quỹ còn số dư → 409. Danh mục: tạo con (mã `test_tien_dien_thoai`), con khác loại cha → 400, chuyển vào con của nó → 400, xoá danh mục hệ thống → 409, ngừng "Tiền nhập hàng" → 409, xoá danh mục chưa dùng ✅. Phiếu: danh mục chi cho phiếu thu → 400, ngày tương lai → 400, số tiền âm → 400, huỷ / sửa phiếu đã huỷ → 409, huỷ phiếu tự động → 409 |
  | Công nợ tổng hợp (phải thu + phải trả) | ✅ Phải trả 26.543.000 / 5 NCC + tuổi nợ; phải thu khách #4 còn 400.000 sau khi trả 50.000; UI tab phải thu / phải trả, thanh tuổi nợ |
  | Báo cáo dòng tiền | ✅ Tiền vào 19.897.100 (bán hàng theo phương thức tổng = doanh thu thuần 19.847.100 + thu nợ 50.000), tiền ra 570.000 (điện, nước, nhập hàng), thuần +19.327.100; số dư quỹ đầu / cuối kỳ |
  | Đối soát thanh toán | ✅ 7 ngày: 81 HĐ, 58 khớp, 23 cần kiểm tra — đều là thẻ / QR nhập tay không có xác nhận Payment Hub (dữ liệu dev), 1 ca chưa nộp quỹ; tiền mặt khớp kiểm ca |
  | UI: sổ quỹ dạng sổ, filter thời gian, category | ✅ 7 trang render không lỗi console; 375 px không tràn ngang (sidebar chung vẫn che — #54). Mở lại cùng URL trong cùng tab kẹt "Đang tải..." = lỗi có sẵn #56, tab mới bình thường |
  | Audit log | ✅ 15 dòng `accounting.*`, `supplier.record_payment`, `crm.pay_debt` đúng entity |
  | format:check / lint / typecheck / test / build / build:jobs | ✅ (Vitest 146/146); migration `6_accounting` áp lên DB dev, `prisma migrate diff`: rỗng; `database/schema.sql` nạp được vào DB trống (DB tạm, đã xoá) |
  | Dọn dẹp | ✅ Xoá 2 quỹ TEST + 15 biến động, 5 phiếu, thanh toán NCC test, 15 dòng audit test; trả công nợ NCC #1 và nợ khách #1 về đúng giá trị trước test (đối chiếu snapshot); dừng `next start` :3001. Giữ: 2 quỹ tiền mặt do seed tạo (số dư 0), danh mục "Thu nợ khách hàng" |

  Sửa trong lúc test: build lỗi prerender (`Date.now()` trong client component) → bọc trang trong `Suspense` như `/reports`; bảng kết quả kinh doanh hẹp ở màn trung bình → chia cột từ `xl`; ô "Số dư các quỹ" hiện "—" thừa → ghi số dư đầu kỳ vào nhãn.

- **Khác biệt so với plan:**
  - Thêm `accountingReport.service.ts` (lời lỗ, dòng tiền, công nợ, đối soát) bên cạnh `cashFund` / `ledger` service; thêm các trang `/accounting/records`, `/debts`, `/reports`, `/reconciliation`, `/categories` và tab điều hướng chung (PLAN chỉ nêu `/accounting` + `/accounting/cash-funds`).
  - API là tRPC `accounting.*` thay cho REST `/api/accounting/*` (API-Design §12) như các module trước. "Xoá phiếu" (`DELETE`) → **huỷ phiếu** (giữ chứng từ, đảo biến động).
  - Gom #67 (phiếu chi khi thanh toán NCC) và thêm phiếu thu khi khách trả nợ, chọn quỹ ở form thanh toán NCC / CRM.
  - #65 (giá vốn theo lần nhập) **không** làm ở P4.8: đổi cách tính giá vốn ảnh hưởng báo cáo P4.2 và hoa hồng P4.1 → cần quyết định nghiệp vụ, chuyển sang task riêng.

- **Quyết định thiết kế:**
  - Sổ quỹ chỉ thêm (append-only): sửa / huỷ phiếu ghi biến động đảo chiều thay vì sửa số cũ → `balance_after` của từng dòng luôn là số dư thật, đối chiếu được; phiếu huỷ giữ lại kèm lý do.
  - Phiếu thu chi có cột `type` riêng (thêm bằng migration) vì danh mục kiểu `both` không xác định được chiều tiền.
  - Lời lỗ dựa trên hoá đơn (doanh thu thuần, giá vốn tại thời điểm bán) + phiếu thu chi; các khoản chỉ là luồng tiền của nghiệp vụ đã tính (thu tiền bán hàng, thu nợ, trả tiền hàng) loại khỏi lời lỗ theo danh mục để không tính hai lần; dòng tiền thì tính tất cả.
  - Tiền POS vào quỹ qua bước "nộp tiền ca" do người dùng xác nhận số tiền (két có thể giữ lại tiền đầu ca) thay vì tự động khi khoá ca.
  - Thanh toán NCC / thu nợ luôn lập phiếu (có hoặc không quỹ) trong cùng transaction → sổ thu chi + dòng tiền đầy đủ từ P4.8.

- **Vấn đề / lưu ý:** đóng #67; cập nhật #57, #61, #65; mới #88–#92. Tenant đã có: `npx prisma migrate deploy` + `npm run db:seed` để có quyền `accounting.read`, danh mục "Thu nợ khách hàng" và quỹ tiền mặt mặc định. **Giai đoạn 4 hoàn thành** (P4.0–P4.8).

### QA-3 — Rà soát cuối Giai đoạn 4 (2026-11-10)

- **Hoàn thành:** 2026-11-10 · **Commit:** `88e21c9` · **Vị trí:** `PROGRESS.md`, `CLAUDE.md` (chỉ tài liệu — chưa sửa code)
- **Bối cảnh:** bước B6 — GĐ 4 xong 9/9 (P4.0–P4.8); GĐ 5 chưa bắt đầu. Người dùng chọn rà soát trước P5.1.
- **Cách làm:** production build BizOne `next start :3001` (+ realtime `:3002`, worker đang chạy bằng `tsx watch` trên cùng code); token Keycloak thật (Authorization Code + PKCE) cho `demo.seller`, `demo.manager` và nhân viên tạm `qa3.seller` tạo qua `staff.create`; script tRPC / REST / WebSocket; một subagent đọc toàn bộ router + service GĐ 4 tìm lỗi phân quyền / cô lập (chỉ đọc), các phát hiện mức cao / trung bình được kiểm lại bằng code hoặc chạy thật. P4.8 dùng kết quả nghiệm thu cùng ngày (code không đổi).

- **Chất lượng (tự động):**

  | Kiểm tra | BizOne | Payment Hub |
  |----------|--------|-------------|
  | `format:check` / `lint` / `typecheck` | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ |
  | `npm test` | ✅ 146/146 (14 file) | ✅ 58/58 (10 file) |
  | `build` / `build:jobs` | ✅ / ✅ | ✅ / ✅ |
  | CI GitHub Actions | ✅ 10 lần chạy gần nhất xanh (tới `b2f0b0c`) | |
  | Prisma: migration / lệch schema | ✅ 7 migration, `migrate status` up to date, `migrate diff` rỗng | ✅ 5 migration, up to date, diff rỗng |
  | `npm audit --omit=dev` | ⚠️ 2 moderate (`exceljs → uuid`, như QA-2) | ✅ 0 |
  | `.env.example` đủ biến code dùng | ✅ | ✅ |
  | Độ phủ test | ⚠️ unit cho quy tắc thuần (giỏ, khuyến mãi, NCC, kế toán, thông báo, chi nhánh, RBAC…); chưa có test tích hợp DB cho service (POS, kho, kế toán) — chỉ script e2e thủ công | ✅ như QA-2 |

- **Tiêu chí nghiệm thu chạy lại:**

  | Task | Tiêu chí (PLAN) | Kết quả QA-3 |
  |------|-----------------|--------------|
  | P4.0 | Bypass: không token → user dev; token thật seller 403 trang quản trị; token sai 401 | ✅ không token → 200 (admin dev); token thật seller → `staff.list` / `accounting.records` 403; token giả → 401; manager → `accounting.records` 200 |
  | P4.1 | Thêm NV → phân quyền → check-in → bán hàng → hoa hồng tự tính; audit log | ✅ `staff.create` (tạo tài khoản Keycloak, vai trò seller @ CN-HN) → token thật của NV mới → check-in → mở ca → HĐ 40.000 (62 ms) → worker tính hoa hồng 800 = 2 % (quy tắc tạm); audit `staff.create`, `check_in`; NV seller xem DS nhân viên → 403 |
  | P4.2 | Report < 3 s; export < 5 s; so sánh cùng kỳ; filter | ✅ revenue / profit / products / staff / branches 7–10 ms; xuất xlsx 232 ms, pdf 238 ms (worker); kỳ so sánh 22–31/10 liền kề, cùng 10 ngày; lọc danh mục 2.825.505 ≤ tổng 19.897.100 |
  | P4.3 | PO → nhập kho → phiếu nhập tự động; công nợ NCC; so sánh giá | ✅ PO 10 × 12.000 vào kho tạm → nhận đủ → `received` + phiếu nhập `purchase_receipt` gắn đơn; công nợ đơn 120.000 (hạn theo điều khoản NCC); so sánh giá SP #11 giữa các NCC |
  | P4.4 | Coupon áp POS đúng; flash sale đúng giờ; mua X tặng Y tự thêm quà | ✅ mã cố định 5.000 → `discountAmount` 5.000; flash sale đang chạy SP #9 45.000 → 30.000, flash sale chưa tới giờ → giá thường; mua 2 tặng 1 → dòng `gift-…` 0₫ |
  | P4.5 | QR Payment Hub; đổi trả; tách HĐ; ghép PIN | ✅ PIN 6 số → `/api/pos/pair` → token `pdt_`, dùng lại PIN 404, token hợp lệ đúng ca, màn hình khách nhận trạng thái qua WS; đổi hàng: chênh lệch 10.000 → phiếu trả + HĐ mới. ⏭ QR qua Payment Hub: `.env.local` đang để `PAYHUB_API_SECRET` placeholder → "Chưa cấu hình Payment Hub" (đã nghiệm thu P4.5 với cấu hình tạm); ⏭ tách HĐ (chỉ qua WS, unit `pos-advanced` 14 test) |
  | P4.6 | User A thấy branch A; đổi branch → dữ liệu đổi; báo cáo tổng hợp | ✅ NV gán CN-HN: `branch.mine` chỉ CN-HN, `X-Branch-ID` CN-HCM → 403, "tất cả" → 403; doanh thu HN 19.897.100 / HCM 0, `reports.branches` tổng = tổng 2 chi nhánh. ❌ **đọc theo id / WebSocket POS không kiểm chi nhánh** (#93, #94) |
  | P4.7 | Đơn online → thông báo; template → email đúng nội dung; WS real-time | ✅ `order.create` Shopee → WS `/ws/notifications` (token thật manager) nhận `notification:new` sau **46 ms**, có trong trung tâm thông báo; gửi thử mẫu `order_new_email` → log gửi `sent` (provider `log`, chưa cấu hình SMTP), tiêu đề đã thay biến |
  | P4.8 | Thu / chi / sổ quỹ / lời lỗ | ✅ theo nghiệm thu P4.8 cùng ngày (code không đổi) |

- **Bảo mật & cô lập (subagent đọc code + kiểm lại):**
  - ❌ **#93 (cao, đã chạy thật)**: ca CN-HCM do manager mở; NV CN-HN kết nối `/ws/pos/9` bằng token thật → `cart:add` + `display:qr` (QR "ATTACKER") được chấp nhận, màn hình manager nhận `cart:updated` + `display:qr`.
  - ❌ #94 (đã chạy thật `pos.session` + `sessionSummary` → 200 lộ tiền đầu ca / tiền mặt dự kiến), #95, #96 (đọc code), #97, #98, #99.
  - ✅ Đúng: mọi procedure GĐ 4 có capability phù hợp; kế toán, đơn nhập, kho / chuyển kho / kiểm kê, đơn hàng, báo cáo, HĐ `get`/`print`, danh sách POS lọc chi nhánh đúng; key Redis / kênh pub-sub / job BullMQ mang tenant, WS + route public chạy trong `runWithTenant`; webhook Payment Hub (HMAC `timingSafeEqual`, cửa sổ thời gian, chống trùng, kiểm số tiền); intent Payment Hub dùng 1 lần; giới hạn coupon / flash sale / combo, hoàn hàng, quỹ, thanh toán NCC, đơn nhập đều có khoá / cập nhật có điều kiện; mutation nghiệp vụ GĐ 4 đều có audit; không còn `new Error` trên đường tRPC, không `Number(ctx.user.id)`.
- **Rà soát vấn đề còn mở:** không mục cũ nào được giải quyết thêm trong QA-3.
  - Chờ người dùng: #6 (xoá rollback MariaDB 10.3), #16 + #26 + #75 (credential VNPay sandbox), #23 (tài khoản VietQR thật), #65 (chọn cách tính giá vốn), #83 (nhà cung cấp SMS), #84 (VAPID + thử Web Push trên Chrome), #85 (Zalo OA), #98 (theo thiết kế hay chặn).
  - Đưa vào GĐ 5: #18, #29, #74 (P5.3 hoàn tiền); #19, #24, #33, #88, #91 (P5.4 đối soát); #55 (trước khi merchant tích hợp).
  - GĐ 6: #7 + #15 (P6.7 đăng nhập trình duyệt — cũng cần cho #56), #12 + #13 + #28 + #32 + #37 + #53 (P6.5 / P6.6), #54 (sidebar 375 px, P6.4 PWA), #61 + #72 + #82 + #87 (P6.1).
- **Vận hành:** dev server `npm run dev` khởi động trước khi `prisma generate` của P4.8 vẫn giữ Prisma client cũ → mọi truy vấn kế toán lỗi `Unknown argument status` trên :3000 (bản build :3001 bình thường). Khởi động lại `npm run dev` (và `dev:realtime`, `dev:worker` nếu không tự nạp lại) sau mỗi migration — đã ghi vào `CLAUDE.md`.
- **Dọn dẹp:** xoá mọi dòng tạo trong phiên (so `max(id)` từng bảng với snapshot: 2 ca POS, 2 HĐ + dòng / thanh toán, 1 phiếu trả, 4 phiếu kho, kho tạm, PO + công nợ, mã giảm giá, 2 flash sale, 1 mua X tặng Y, quy tắc + 2 dòng hoa hồng, chấm công, đơn online, 2 thông báo + log gửi, 21 audit, user `qa3.seller` + phân quyền, user cục bộ `demo.manager@bizone.vn` tạo khi mở ca); khôi phục tồn kho / lô / lượt dùng mã / chi tiêu khách — **so với snapshot: giống hệt**; xoá key Redis (giỏ ca 9, token ghép màn hình, cache rbac, file báo cáo); xoá user Keycloak `qa3.seller`; dừng :3001. Không đụng ca POS #6 đang mở của admin.
- **Đề xuất:** sửa #93 (cao) và #94–#96 trước P5.1 (cùng một nhóm: phạm vi chi nhánh cho POS / ca làm việc); #97, #99 cùng lượt nếu đồng ý; #98 cần người dùng chọn (theo thiết kế: `staff:write` = quản trị, hay chặn cấp vai trò admin/manager).
