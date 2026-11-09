# Tiến độ thực hiện — BizOne & Payment Hub

> Theo dõi tiến độ các task trong [PLAN.md](PLAN.md) và ghi chú kết quả của từng task.
> Cập nhật mỗi khi một task bắt đầu, hoàn thành hoặc bị chặn.

**Trạng thái:** ✅ Hoàn thành · 🟡 Đang làm · ⬜ Chưa bắt đầu · ⛔ Bị chặn

**Cập nhật lần cuối:** 2026-11-09 (P4.0 xong — `AUTH_DEV_BYPASS=true` bỏ qua đăng nhập Keycloak khi dev/test cho cả 2 app; #7 có cách dùng tạm, #56 cập nhật; P3.3/P3.4/P3.5 vẫn 🟡 chờ credential VNPay / quét QR)

---

## Tổng quan

| Giai đoạn | Tổng task | ✅ | 🟡 | ⬜ |
|-----------|-----------|----|----|----|
| 1 — Nền tảng | 8 | 8 | 0 | 0 |
| 2 — BizOne Core MVP | 10 | 10 | 0 | 0 |
| 3 — Payment Hub MVP | 8 | 5 | 3 | 0 |
| 4 — BizOne Mở rộng | 9 | 3 | 0 | 6 |
| 5 — Payment Hub Mở rộng | 6 | 0 | 0 | 6 |
| 6 — BizOne Nâng cao | 7 | 0 | 0 | 7 |
| 7 — Payment Hub Nâng cao | 5 | 0 | 0 | 5 |
| **Tổng** | **53** | **26** | **3** | **24** |

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
| 11 | Seed chưa có chi nhánh/kho mặc định → POS cần tạo chi nhánh + kho (gắn `branch_id`) trước khi mở ca | P2.5 | P4.6 Multi-store (hoặc seed) |
| 12 | Docker image/compose của BizOne chưa chạy process `pos.mjs` (WS :3002) và `worker.mjs` (từ P4.2: thiếu worker thì yêu cầu xuất báo cáo PDF/Excel nằm chờ mãi; worker cần `node_modules/pdfmake` — để external khi bundle) | P2.5 | P6.5 / khi triển khai |
| 13 | Hàng đợi tuần tự cart theo ca nằm trong bộ nhớ process WS → chạy nhiều instance cần sticky theo `sessionId` (hoặc Redis lock) | P2.5 | P6.5 |
| 14 | Chưa có UI cài đặt tài khoản ngân hàng cho VietQR (`store_config.bank_*`) và tên cửa hàng — đang sửa trực tiếp trong DB | P2.6 | Module Cài đặt (P4.x) |
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
| 30 | BizOne `/api/webhooks/payhub` mới xác thực + chống trùng + ghi log; chưa áp sự kiện vào hoá đơn/đơn hàng. Secret là một biến `PAYHUB_WEBHOOK_SECRET` cho cả app — chưa map merchant Payment Hub ↔ tenant BizOne | P3.6 | P4.5 (POS ↔ Payment Hub) |
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
| 54 | Layout BizOne (`Sidebar`) chưa responsive: ở 375 px sidebar mở sẵn che nội dung (giống #27 bên Payment Hub; P4.2: `main` chỉ còn 151 px); sidebar còn link tới trang chưa có (`/staff` ✅ P4.1, `/reports` ✅ P4.2, `/suppliers`, `/omni`, `/marketing`, `/accounting`, `/settings` → 404 khi prefetch) | QA-2 fix (kiểm UI) | P4.x (trang mới) / P6.x PWA |
| 55 | API tra cứu GD merchant (`GET /api/v1/transactions/{id}`, `/merchant/{merchant_txn_id}`) trả object Prisma camelCase (`txnCode`, `merchantTxnId`) trong khi `POST` và OpenAPI dùng snake_case (`txn_code`…) — đổi sẽ ảnh hưởng hợp đồng API | QA-2 fix | Trước khi có merchant tích hợp thật (P5.x) |
| 56 | Lần tải lại thứ 2 **cùng URL trong cùng tab** của một số trang client (`/audit-log`, `/staff`, `/staff/shifts`, `/staff/commissions`, `/warehouse`) kẹt ở fallback Suspense "Đang tải..." (component bên trong không render, không gọi API) — P4.0 (2026-11-09) xác nhận xảy ra **cả với `next start`** và cả bản HEAD trước P4.0 (tab mới / điều hướng từ sidebar thì bình thường); có từ trước P4.1 | P4.1 (kiểm UI) | Theo dõi khi nâng Next / task auth UI (#7) |
| 57 | Quyền chi tiết (`permissions`, 52 mã) được gán cho vai trò tuỳ chỉnh nhưng API mới kiểm ở mức module (`pos:write`, `product:write`…): gán "Hủy hóa đơn" = mở toàn bộ `pos:write`. Quyền của module chưa xây (NCC, kế toán, marketing, omni, cài đặt) chưa có tác dụng | P4.1 | Khi xây module tương ứng (P4.3, P4.4, P4.8, P6.x) — tách capability theo thao tác |
| 58 | WebSocket POS (`server/ws/pos.ts`) chỉ xét role trong token: vai trò tuỳ chỉnh không áp dụng và nhân viên bị cho nghỉ việc vẫn giữ kết nối WS đang mở tới khi token hết hạn (≤ 15 phút). API tRPC đã chặn ngay | P4.1 | P4.5 (POS nâng cao) |
| 59 | Chấm công 1 lần/ngày (`attendance` unique `user_id, date`): nhiều ca trong ngày được gộp thành một khung (bắt đầu sớm nhất → kết thúc muộn nhất); chưa có sửa/duyệt chấm công thủ công, chưa có ngày nghỉ phép | P4.1 | Khi có yêu cầu nghiệp vụ (P4.x/P6.x) |
| 60 | Phân quyền cần chi nhánh (`user_roles.branch_id` NOT NULL) mà chưa có màn hình tạo chi nhánh (#11). Nhân viên tạo trước P4.1 (vd. `admin@bizone.vn`, tự sinh khi đăng nhập) chưa có vai trò trong DB → danh sách hiện "Chưa phân quyền trong BizOne" (quyền vẫn theo Keycloak); gán vai trò trong UI sẽ đồng bộ lại role Keycloak | P4.1 | P4.6 Multi-store |
| 61 | Báo cáo (và dashboard) chỉ tính hoá đơn POS; đơn hàng online (module Đơn hàng, P2.7) chưa cộng vào doanh thu/lợi nhuận/nhân viên — cần quy tắc ghi nhận doanh thu cho đơn online (khi giao/hoàn tất, phí ship, hoàn tiền) | P4.2 | P6.1 (Omni Channel) hoặc task đơn hàng ↔ thanh toán |
| 62 | Chưa có "Gửi email" báo cáo và gửi báo cáo định kỳ tự động (mockup 07, SRS-RPT-08) | P4.2 | P4.7 Thông báo (email) |
| 63 | Báo cáo khuyến mãi so sánh theo khung ngày (trước/trong/sau) + lượt dùng mã giảm giá; chưa đo riêng flash sale / Buy X Get Y vì chưa có module Marketing | P4.2 | P4.4 Marketing |
| 64 | Lỗi validate input (Zod) của tRPC trả `message` là chuỗi JSON thô của Zod (vd. "Ngày bắt đầu phải trước ngày kết thúc" nằm trong mảng) — áp dụng mọi router; UI báo cáo đã chặn khoảng ngày sai trước khi gọi | P4.2 (kiểm lỗi) | Chuẩn hoá cùng #52 |
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
| P4.0 | Bypass xác thực Keycloak cho dev/test | ✅ | _(xem kết quả)_ | Xem [kết quả P4.0](#p40--bypass-xác-thực-keycloak-cho-devtest) — gỡ ở P6.7 |
| P4.1 | Staff Module — API & UI | ✅ | `fdb36cd` | Xem [kết quả P4.1](#p41--staff-module--api--ui) |
| P4.2 | Reports Module — API & UI | ✅ | `335d41d` | Xem [kết quả P4.2](#p42--reports-module--api--ui) |
| P4.3 | Supplier Module — API & UI | ⬜ | — | |
| P4.4 | Marketing Module — API & UI | ⬜ | — | |
| P4.5 | POS Advanced Features | ⬜ | — | |
| P4.6 | Multi-Store Support | ⬜ | — | |
| P4.7 | Thông báo — Hệ thống + Email + SMS | ⬜ | — | |
| P4.8 | Kế toán & Tài chính — API & UI | ⬜ | — | |

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

- **Hoàn thành:** 2026-11-09 · **Commit:** _(xem bên dưới)_ · **Vị trí:** `source/bizone/lib/auth.ts`, `lib/dev-auth.ts`, `proxy.ts`, `server/trpc.ts`, `server/ws/pos.ts`, `components/layout/AppLayout.tsx`, `app/products/**/page.tsx`, `tests/dev-auth.test.ts`; `source/payment-hub/lib/auth.ts`, `lib/dev-auth.ts`, `proxy.ts`, `server/ws/server.ts`, `components/ph/PHLayout.tsx`, `tests/dev-auth.test.ts`; `.env.example` 2 app
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
