# Hướng dẫn phát triển Connector Plugin — Payment Hub

> Dành cho bên thứ ba muốn tích hợp một PSP (cổng thanh toán, ví, ngân hàng) vào BizOne Payment Hub mà **không sửa mã nguồn core** (SRS-PaymentHub §3.3, SRS-PH-PARTNER-02). Áp dụng từ P7.1 — phiên bản API connector **1.0.0**.
>
> Mẫu đầy đủ chạy được: `source/payment-hub/examples/connector-plugins/demopay/` (plugin `plugin/` + PSP giả lập `mock-server.mjs`).

## 1. Tổng quan

```
Merchant ──POST /api/v1/transactions──▶ Payment Hub core
                                          │ Route Engine chọn cấu hình đối tác (partner config)
                                          ▼
                              ┌───────────────────────────┐
                              │ Tiến trình sandbox riêng   │  ← mỗi plugin 1 process Node
                              │  createConnector(config)   │    (không đọc / ghi file, không mở
                              │  .createTransaction(...)   │     process con, chỉ gọi host khai báo)
                              └───────────┬───────────────┘
                                          ▼ fetch
                                         PSP
PSP ──callback──▶ /api/ipn/plugin/{code}   (core gọi callbackKeys → verifySignature → processResult)
Trình duyệt ◀── /pay/plugin/{code}/return  (core kiểm chữ ký, hỏi lại PSP nếu chưa có callback)
```

- Plugin chỉ **dịch** giữa DTO chuẩn của core và định dạng của PSP. Mọi quyết định nghiệp vụ (trạng thái giao dịch, chống trùng IPN, kiểm số tiền, hoàn tiền giữ chỗ, webhook cho merchant, đối soát) do core làm.
- Plugin chạy trong **sandbox**: process riêng, bật permission model của Node; chỉ import được `node:crypto`, `buffer`, `url`, `querystring`, `util`, `events`, `string_decoder`, `zlib`, `timers`, `assert` và tệp trong gói; không `eval`; `fetch` chỉ tới `network.allowedHosts` + host của endpoint trong cấu hình đối tác; không có `WebSocket`. Môi trường không chứa bí mật của Hub — cấu hình đối tác (đã giải mã) được truyền theo từng lần gọi.
- Lỗi / treo / tràn bộ nhớ chỉ làm sập process của plugin đó; lần gọi sau khởi động process mới. Gọi quá hạn (`timeout` của cấu hình + 2 s) → process bị dừng. Sập 5 lần / 60 s → tạm ngắt 30 s.

## 2. Cấu trúc gói

Một tệp `.zip` (≤ 5 MB, ≤ 100 tệp, giải nén ≤ 20 MB, tên tệp chỉ gồm `A-Z a-z 0-9 . _ -` và `/`):

| Tệp | Bắt buộc | Nội dung |
|-----|----------|----------|
| `manifest.json` | Có | Khai báo connector (mục 3) |
| `<entry>.mjs` | Có | ES module **tự chứa** (bundle sẵn, không `node_modules`, không import gói npm) |
| `SIGNATURE.json` | Có | Chữ ký Ed25519 của nhà phát hành (mục 5) — do script tạo |
| `README.md`, `CHANGELOG.md`, tệp khác | Không | Đi kèm, cũng được ký |

Dùng esbuild nếu cần thư viện: `esbuild src/index.ts --bundle --platform=node --format=esm --outfile=plugin/index.mjs`.

## 3. `manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "code": "demopay",                 // a-z0-9_ (3–30), duy nhất; URL: /api/ipn/plugin/demopay
  "connectorType": "DemoPay",        // giá trị partner_configs.connector_type (không đổi khi nâng cấp)
  "name": "DemoPay",
  "version": "1.0.0",                // semver; nâng cấp phải lớn hơn bản đang cài
  "description": "…",
  "publisher": "Công ty ABC",
  "coreCompatibility": "^1.0.0",     // dải phiên bản API connector của core (hiện 1.0.0)
  "pspApiVersion": "v2",             // phiên bản API của PSP (thông tin)
  "entry": "index.mjs",
  "protocols": ["REST"],             // REST | SOAP | MQ | SFTP | OpenAPI | Proprietary
  "paymentMethods": [                // phương thức merchant gửi ở payment_method
    { "method": "demopay_wallet", "label": "Ví DemoPay", "minAmount": 1000, "maxAmount": 100000000 }
  ],
  "config": {                        // form "Đối tác" — 3 trường credential + endpoint
    "merchantCode": { "label": "Mã merchant", "secret": false, "pattern": "^[A-Z0-9]{3,20}$", "patternMessage": "…" },
    "apiKey":       { "label": "API Key", "secret": true },
    "secretKey":    { "label": "Secret", "secret": true },
    "usesEndpoints": true,
    "defaultEndpointSandbox": "https://sandbox.psp.vn",
    "defaultEndpointProduction": "https://api.psp.vn"
  },
  "capabilities": {
    "statusSync": true,              // worker hỏi getStatus() khi IPN trễ / mất
    "refund": { "partial": true, "windowDays": 30, "async": false }   // null = không hỗ trợ hoàn tiền
  },
  "callback": {                      // câu trả lời HTTP của /api/ipn/plugin/{code} theo kết quả xử lý
    "responses": {
      "ok":                { "status": 200, "body": { "code": "00" } },
      "invalid_signature": { "status": 200, "body": { "code": "97" } },
      "not_found":         { "status": 200, "body": { "code": "01" } },
      "amount_mismatch":   { "status": 200, "body": { "code": "04" } },
      "error":             { "status": 500, "body": { "code": "99" } }   // PSP nên gửi lại
    }
  },
  "network": { "allowedHosts": ["api.psp.vn", "*.psp.vn"] },
  "changelog": [ { "version": "1.0.0", "date": "2026-11-20", "changes": ["Bản đầu tiên"] } ]
}
```

Quy tắc: `code`, `connectorType`, `method` không được trùng connector tích hợp sẵn (VNPay, MoMo, ZaloPay, VietQR — `vnpay*`, `momo_qr`, `zalopay_qr`, `vietqr`) hay plugin khác; `changelog` phải có mục của `version`.

## 4. Module — interface `IConnector`

Định nghĩa: `source/payment-hub/services/connectors/interface.ts` + DTO ở `types.ts`.

```js
// Bắt buộc
export function createConnector(config) { … return connector; }
// Bắt buộc khi manifest có "callback": đọc mã GD + chữ ký từ payload IPN / return URL
// (gọi TRƯỚC khi core biết dùng cấu hình đối tác nào → không có secret)
export function callbackKeys(raw) { return { txnCode, signature } | null; }
```

`config` (`ConnectorConfig`): `merchantCode`, `apiKey`, `secretKey` (đã giải mã), `endpoint` (theo môi trường), `apiEndpoint`, `ipnUrl` (gửi cho PSP làm URL thông báo), `environment`, `timeoutMs`.

| Phương thức | Bắt buộc | Ghi chú |
|-------------|----------|---------|
| `code`, `version` | Có | Phải khớp manifest (kiểm khi tải lên) |
| `createTransaction(PaymentRequest)` | Có | Trả `{ paymentUrl (http/https), partnerRequest (map chuỗi), partnerResponse?, partnerQr? }`. Lần tạo lại link thứ N có `attempt = N` (PSP cần mã đơn duy nhất → `txnCode_N`). Ghi `partnerRequest.orderId` = mã đơn gửi PSP — core truyền lại ở `StatusQuery.partnerOrderId` |
| `processResult(raw)` | Có | Payload (query + body JSON/form phẳng thành chuỗi) → `PaymentResult { txnCode, outcome: Success\|Failed\|Pending, amount, partnerTxnId?, paidAt?, errorCode?, errorMessage?, partnerRaw }`. Kết quả chưa chắc chắn → `Pending` (không bao giờ `Failed`) |
| `verifySignature(payload, signature)` | Có | Chỉ `true` mới được coi là hợp lệ; so sánh thời gian hằng |
| `getStatus(StatusQuery)` | Có | Tra cứu; `outcome: Unknown` khi không kết luận được; `amount` để đối soát |
| `refund(RefundRequest)` | Có | `pending: true` cho mọi câu trả lời mơ hồ (timeout, 5xx, chữ ký sai) — core giữ `Processing`, không coi là thất bại |
| `queryRefund(ref)` | Khi `refund.async` | Worker hỏi lại hoàn tiền bất đồng bộ |
| `getConfigSchema()` | Có | Mô tả trường cấu hình |
| `healthCheck()` | Có | `{ healthy, latencyMs, message }` — dùng cho "Test kết nối" và Health Monitor |
| `generateQR`, `submitDispute`, `queryDispute` | Không | Tuỳ chọn (tra soát qua API: chưa hỗ trợ cho plugin ở phiên bản 1.0.0) |

- Lỗi do **dữ liệu giao dịch** (số tiền ngoài hạn mức…) → `throw` lỗi có `code = "VALIDATION_ERROR"` (hoặc `CONFLICT`, `NOT_FOUND`): core trả lỗi cho merchant, **không** chuyển sang đối tác khác. Lỗi khác (mạng, 5xx…) → core ghi lỗi cho circuit breaker và thử đối tác kế tiếp.
- Dữ liệu trả về được core kiểm lại (URL phải http/https, `outcome` hợp lệ, `amount` nguyên ≥ 0…); sai → coi như lỗi plugin.
- Không ghi log dữ liệu nhạy cảm. Core vẫn che `apiKey` / `secretKey` của cấu hình nếu chúng lọt vào log, nhưng plugin chịu trách nhiệm theo Security Contract (SRS §3.3.7): TLS 1.2+, HMAC, không log PAN/CVV/secret.

## 5. Ký gói & tải lên

Payment Hub chỉ cài gói được ký bởi **khoá nhà phát hành tin cậy** (biến `CONNECTOR_TRUSTED_KEYS` của Payment Hub) — tài khoản admin bị lộ cũng không cài được mã lạ. Chữ ký kiểm lại mỗi lần một process tải gói (gỡ khoá khỏi env = thu hồi các plugin của khoá đó). Bản nâng cấp phải do **cùng khoá** ký.

```bash
# 1. Nhà phát hành tạo khoá (1 lần) — giữ kín tệp .private.pem
node scripts/connector-plugin.mjs keygen acme --out ~/.acme-keys
#    → gửi dòng "acme=MCow…" cho đơn vị vận hành Payment Hub để thêm vào CONNECTOR_TRUSTED_KEYS

# 2. Đóng gói + ký
node scripts/connector-plugin.mjs pack ./plugin --key ~/.acme-keys/acme.private.pem --key-id acme --out acme-1.0.0.zip

# 3. (tuỳ chọn) kiểm lại
CONNECTOR_TRUSTED_KEYS="acme=MCow…" node scripts/connector-plugin.mjs verify acme-1.0.0.zip
```

Tin nhắn được ký: dòng `payhub-connector-v1`, sau đó mỗi tệp (trừ `SIGNATURE.json`, sắp theo đường dẫn) 2 dòng `đường-dẫn` + `sha256 hex` — thêm / bớt / sửa tệp nào cũng làm hỏng chữ ký.

Tải lên: màn hình **Connector** (`/connectors`, role `payhub-admin`) hoặc API `POST /api/internal/connectors` (body = zip, `Content-Type: application/zip`). Core kiểm: chữ ký → manifest → trùng tên → phiên bản → **tải thử trong sandbox** (`createConnector` + đủ phương thức + `code`/`version` khớp, có `callbackKeys` nếu có callback, có `queryRefund` nếu hoàn tiền bất đồng bộ).

## 6. Vòng đời (không cần khởi động lại)

| Thao tác | Ở đâu | Ghi chú |
|----------|-------|---------|
| Cài mới | Tải gói lên | Trạng thái **Ngưng** |
| Cấu hình | `/partners` → Thêm đối tác → loại connector của plugin | Form theo `manifest.config`; callback / IPN mặc định `/pay/plugin/{code}/return`, `/api/ipn/plugin/{code}`; "Test kết nối" gọi `healthCheck()` |
| Kích hoạt | `/connectors` → Kích hoạt | Mọi process (app, worker, nhiều instance) cập nhật ≤ ~1 s; giao dịch mới được định tuyến |
| Vô hiệu hoá | `/connectors` → Vô hiệu hoá | Giao dịch mới không định tuyến tới connector; callback của giao dịch đã tạo **vẫn được xử lý** |
| Nâng cấp | Tải gói cùng `code`, `version` lớn hơn, cùng khoá | Bản mới phục vụ ngay; process bản cũ chạy nốt lệnh đang dở rồi dừng. Không hạ cấp |
| Gỡ | `/connectors` → Gỡ | Chỉ khi đã vô hiệu hoá, không còn cấu hình đối tác **hoạt động** và không còn giao dịch **Pending** qua connector |
| Giám sát | Worker mỗi `CONNECTOR_HEALTH_INTERVAL_S` (300 s) | `healthCheck()` với cấu hình đối tác hoạt động; lịch sử ở chi tiết connector |

## 7. Kiểm thử cục bộ với mẫu DemoPay

```bash
cd source/payment-hub
node examples/connector-plugins/demopay/mock-server.mjs          # PSP giả :4510 (DEMOPAY_SECRET=demo-secret)
node scripts/connector-plugin.mjs pack examples/connector-plugins/demopay/plugin \
  --key ../../.secrets/payhub-dev.private.pem --key-id payhub-dev --out demopay.zip
# Tải demopay.zip ở /connectors → thêm đối tác DemoPay (secret "demo-secret", endpoint http://localhost:4510)
# → Test kết nối → Kích hoạt đối tác → Kích hoạt connector → tạo GD payment_method "demopay_wallet"
curl -X POST "http://localhost:4510/simulate/<txn_code>?status=PAID"          # PSP gửi callback
curl -X POST "http://localhost:4510/simulate/<txn_code>?status=PAID&callback=0" # mất IPN → core hỏi getStatus
```

Khoá dev `payhub-dev` (`.secrets/payhub-dev.private.pem`, không commit) chỉ dùng cho môi trường dev; production tạo khoá riêng cho từng nhà phát hành.

## 8. Giới hạn của phiên bản 1.0.0

- Node permission model không chặn mạng ở mức hệ điều hành: danh sách host được áp cho `fetch` (và chặn `node:net/http/https/tls/dgram`), đủ cho plugin đã ký — không thay thế cho việc thẩm định mã của nhà phát hành.
- Plugin chỉ dùng kiểu thanh toán chuyển hướng (`paymentUrl`, kèm QR ví tuỳ chọn); chưa có kiểu "core tự sinh QR" như VietQR.
- Chưa có API tra soát cho plugin; tra soát qua email / thủ công như các đối tác hiện tại.
- Cấu hình đối tác chỉ có 3 trường credential + endpoint (các tham số riêng khác đặt trong `secretKey` dạng JSON nếu cần).
