# Payment Hub — Disaster Recovery & Monitoring Runbook (P7.5)

> Tài liệu vận hành: sao lưu / khôi phục, giám sát, cảnh báo, chiến lược suy giảm có kiểm soát và kế hoạch kiểm thử khôi phục.
> Áp dụng cho `source/payment-hub` (app, worker, realtime, MariaDB `paymentdb`, Redis, MinIO/S3). Cập nhật: 2026-11-21.

---

## 1. Mục tiêu

| Chỉ số | Mục tiêu | Ghi chú |
|--------|----------|---------|
| Uptime (SRS-PH-NFR-16, AC-PH-NFR-01) | **99,9 %** | Ngân sách downtime: **8 giờ 45 phút / năm**, 43 phút 12 s / 30 ngày, 1 phút 26 s / ngày |
| RPO (mất dữ liệu tối đa) | **24 giờ** (backup hằng ngày, SRS-PH-NFR-21) | Muốn thấp hơn: bật binlog + sao binlog liên tục (§3.6) |
| RTO (thời gian khôi phục) | **≤ 1 giờ** | Đo bằng `backup-verify.sh` (dòng `restoreSeconds` trong `backup_runs`) + thời gian dựng lại app |
| Lưu giữ backup | **30 ngày** (`BACKUP_RETENTION_DAYS`) | Bản off-site theo chính sách lifecycle của bucket đích |

"Downtime" = `/api/v1/health` trả `down` (HTTP 503 — DB không truy cập được) hoặc không trả lời. Trạng thái `degraded` (một phần lỗi, thanh toán vẫn chạy) **không** tính là downtime nhưng vẫn cảnh báo (§7).

## 2. Dữ liệu cần bảo vệ

| Thành phần | Chứa gì | Cách bảo vệ |
|------------|---------|-------------|
| MariaDB `paymentdb` | Giao dịch, hoàn tiền, đối soát, tra soát, cấu hình đối tác (secret mã hoá), API key, audit log, gói connector plugin | `scripts/backup.sh` hằng ngày (dump nhất quán `--single-transaction`, kèm trigger append-only) |
| Storage (MinIO / S3 bucket `payment-hub`, hoặc thư mục `STORAGE_LOCAL_DIR`) | Chứng từ tra soát | `backup.sh` tải toàn bộ object vào `files.tar.gz`; production nên bật thêm **versioning + replication** của bucket |
| Redis | Hàng đợi BullMQ, idempotency key (24 h), rate limit, cache, circuit breaker, QR ảnh, phiên bị thu hồi | **Không backup** — dữ liệu dựng lại được: webhook nằm ở outbox trong DB (bộ quét gửi lại), lịch job định kỳ được worker đăng ký lại khi khởi động, cache tự nạp. Mất Redis = mất idempotency key đang giữ (trùng `merchant_txn_id` vẫn bị DB chặn → 409) và job email / đối soát đang chờ (chạy lại tay). Compose bật AOF (`--appendonly yes`) để restart không mất |
| Secret / cấu hình (`.env.*`, `PARTNER_ENCRYPTION_KEY`, `DATA_ENCRYPTION_KEY`, khoá ký plugin, `BACKUP_ENCRYPTION_KEY_FILE`) | Giải mã secret đối tác / API key trong DB | **Không nằm trong backup** — lưu ở Vault / KMS / trình quản lý secret (SRS-PH-NFR-11). Mất `PARTNER_ENCRYPTION_KEY` = backup DB còn nhưng không giải mã được secret đối tác / API secret merchant |
| Keycloak (`keycloakdb`) | Realm, user admin | Ngoài Payment Hub; dùng cùng script: `DATABASE_URL=mysql://…/keycloakdb BACKUP_FILES=false BACKUP_RECORD=false scripts/backup.sh --dir …` |

## 3. Sao lưu

### 3.1 Tự động (Docker compose)

Service `backup` (image `bizone-payhub-ops`, target `ops` của Dockerfile) chạy `scripts/backup-cron.sh`: mỗi ngày lúc `BACKUP_TIME` (mặc định **01:30** giờ VN, trước job lưu trữ 02:15 / archive 02:45) → `backup.sh` → `backup-verify.sh latest` (restore test, §6). Backup ghi vào volume `backups` (hoặc `BACKUP_HOST_DIR`). Healthcheck của container = vòng lặp lịch còn sống.

Ngoài Docker: cron / systemd timer

```
30 1 * * *  cd /srv/payment-hub && scripts/backup.sh --env-file .env.production && scripts/backup-verify.sh --env-file .env.production
```

### 3.2 Một bộ backup

```
backups/payhub-YYYYmmdd-HHMMSS/
  db.sql.gz[.enc]     mariadb-dump --single-transaction --routines --triggers --events --hex-blob
  files.tar.gz[.enc]  objects/<key> + index.json (content-type)
  manifest.json       bảng, số dòng, trigger, migration, kích thước, phiên bản server / client
  rows.tsv triggers.txt migrations.txt
  SHA256SUMS
```

Bộ được ghi vào `.partial-…` rồi đổi tên khi hoàn tất (không có bộ dở dang mang tên hợp lệ). Dump thiếu dòng `Dump completed` → lỗi. Mỗi lần chạy ghi 1 dòng `backup_runs` (kind `backup`, `success` / `failed`, kích thước, chi tiết) — health check đọc bảng này (§7.1).

### 3.3 Mã hoá, quyền tệp

- `BACKUP_ENCRYPTION_KEY_FILE` = tệp passphrase → AES-256-CBC + PBKDF2 (200 000 vòng) qua `openssl enc`. Khoá **phải** lưu ngoài máy chủ backup (Vault). Không có khoá = không khôi phục được.
- Tệp backup tạo với `umask 077` (chỉ chủ sở hữu đọc được).

### 3.4 Off-site

`BACKUP_UPLOAD_CMD` — lệnh chạy sau khi bộ hoàn tất, `{}` = thư mục bộ, ví dụ `rclone copy {} r2:payhub-backups/$(basename {})` hoặc `aws s3 cp --recursive {} s3://payhub-backups/…`. Lỗi → giữ bản local, `backup_runs` ghi `failed` ("off-site copy failed") → health `degraded` sau `BACKUP_MAX_AGE_HOURS`, script thoát mã 3. Bucket đích: object lock / versioning, lifecycle ≥ 30 ngày, khác vùng (region) với máy chủ chính.

### 3.5 Lưu giữ

Bộ cũ hơn `BACKUP_RETENTION_DAYS` (30) bị xoá sau mỗi lần backup thành công; bộ `.partial-*` > 24 h bị dọn; `backup_runs` > 400 ngày bị xoá.

### 3.6 Quyền user DB cho backup (production)

User riêng, chỉ đọc: `GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT, PROCESS ON *.* TO 'payhub_backup'@'%'` (+ `CREATE, DROP, INSERT, UPDATE…` trên `paymentdb_restore_check` cho restore test; `INSERT` trên `paymentdb.backup_runs`). App **không** dùng user này và app user **không** có `TRIGGER / DROP / ALTER` (#172).

RPO thấp hơn 24 h: bật `log_bin` trên MariaDB, sao `mariadb-binlog --read-from-remote-server --raw --stop-never` ra máy khác; khôi phục = backup gần nhất + phát lại binlog tới thời điểm cần (chưa tự động hoá — chưa cần ở quy mô hiện tại).

## 4. Khôi phục

> Luôn khôi phục vào **database mới** trước (`--target-db paymentdb_new`), kiểm tra, rồi mới chuyển app sang. Chỉ dùng `--force` khi chắc chắn bỏ dữ liệu hiện có.

### 4.1 Mất / hỏng database (server còn)

1. Dừng ghi: `docker compose stop app worker realtime` (hoặc rút instance khỏi load balancer) — tránh ghi chồng.
2. Chọn bộ: `ls backups/` (hoặc tải từ off-site, kiểm `SHA256SUMS`).
3. `scripts/restore.sh --env-file .env.production <bộ|latest> --target-db paymentdb_new` (khoá mã hoá qua `BACKUP_ENCRYPTION_KEY_FILE`).
4. Kiểm: `scripts/backup-verify.sh <bộ>` đã đạt? Số giao dịch mới nhất trong `paymentdb_new` hợp lý?
5. Trỏ `DATABASE_URL` sang `paymentdb_new` (hoặc đổi tên database), `npm run db:migrate` nếu code mới hơn backup.
6. Khởi động app + worker + realtime → `GET /api/v1/health` = `ok`.
7. **Sau khôi phục**: GD tạo sau thời điểm backup đã mất phía Hub → chạy đối soát (`/reconciliation`) với từng đối tác cho các ngày từ thời điểm backup để tìm GD đối tác có mà Hub không có (`Unmatched_Partner`); IPN của PSP gửi lại sẽ trả "không tìm thấy GD" — ghi nhận và xử lý tay; báo merchant các `merchant_txn_id` cần tạo lại. Ghi biên bản sự cố.

### 4.2 Mất cả máy chủ

1. Dựng máy mới: Docker, clone repo, đặt `.env` từ Vault.
2. `docker compose --env-file … up -d db cache` → khôi phục: `docker compose run --rm backup bash scripts/restore.sh <bộ> --target-db paymentdb --force --files` (bộ lấy từ off-site vào volume `backups`).
3. `docker compose up -d --build` (service `migrate` áp migration còn thiếu) → health `ok` → chuyển DNS / load balancer.
4. Bước 7 của §4.1.

Đã diễn tập ở P7.5: bộ backup mã hoá của `paymentdb` dev khôi phục lên **server MariaDB 10.11 mới** (container trống) + 3 tệp chứng từ lên bucket mới trong 2 s; app chạy ngay trên DB khôi phục.

### 4.3 Khôi phục một phần (xoá nhầm dữ liệu)

Restore vào `paymentdb_restore_check` (`backup-verify.sh <bộ> --keep`) rồi chép đúng dòng cần bằng SQL (`INSERT … SELECT` giữa 2 database). Bảng append-only (`audit_logs`, `transaction_logs`, `transaction_raw_data`, `partner_config_logs`) không sửa được bằng UPDATE — chỉ INSERT dòng thiếu.

### 4.4 Lưu ý kỹ thuật

- `restore.sh` bỏ mệnh đề `DEFINER` (trigger thuộc về user khôi phục, không cần SUPER) và dòng "sandbox mode" của dump MariaDB ≥ 11.4 (để client cũ đọc được). Nếu server bật binlog mà user không có SUPER: `SET GLOBAL log_bin_trust_function_creators = 1` trước khi restore.
- Dump nhất quán tại thời điểm bắt đầu dump; số dòng trong manifest đếm ngay trước dump → ghi trong lúc dump làm số khác nhau (restore test chỉ cảnh báo, không lỗi).

## 5. Chiến lược suy giảm có kiểm soát (graceful degradation)

Chỉ **database** là thành phần sống còn. Mọi thành phần khác lỗi → hệ thống `degraded`, thanh toán vẫn chạy, load balancer **không** rút instance (health HTTP 200).

| Sự cố | Ảnh hưởng | Hệ thống làm gì | Health |
|-------|-----------|-----------------|--------|
| MariaDB không truy cập được | Không đọc / ghi được gì | API merchant trả **503 `SERVICE_UNAVAILABLE` + `Retry-After: 30`** (không 500, chưa tạo gì → merchant thử lại cùng Idempotency-Key); lỗi gửi Sentry; job worker thất bại được thử lại nhịp sau | `down` (503) |
| Redis không truy cập được | Rate limit, idempotency, cache, realtime, hàng đợi | Lệnh Redis lỗi **ngay** (offline queue tắt sau lần kết nối đầu — trước đây mỗi lệnh chờ reconnect, 1 request tạo GD mất 20,9 s); rate limit / brute force **mở**; tạo GD **không idempotency** (header `Idempotency-Status: unavailable`, trùng `merchant_txn_id` vẫn 409); **hoàn tiền 503** (an toàn tiền); webhook chờ trong outbox DB; dashboard poll; sự kiện realtime bỏ qua | `degraded`; realtime + worker container `unhealthy` |
| Không còn worker | Webhook, hết hạn GD, đồng bộ trạng thái PSP, đối soát, email chờ | API vẫn chạy; outbox giữ webhook | `degraded` (workers: 0) |
| Job định kỳ kẹt (scheduler) | Như trên | — | `degraded` (job định kỳ không chạy: …) |
| Realtime chết | Dashboard không đẩy realtime | UI tự poll 15 s | `degraded` |
| Storage (MinIO / S3) lỗi | Tải / xem chứng từ tra soát lỗi | Các luồng khác không ảnh hưởng | `degraded` |
| Một đối tác (PSP) lỗi | GD qua đối tác đó | Circuit breaker theo lỗi tạo thanh toán (P3.8) + **Health Monitor lỗi `CONNECTOR_HEALTH_TRIP_AFTER` (3) lần liên tiếp → giữ circuit mở, định tuyến bỏ qua, đối tác khác vẫn chạy; lần health tốt đầu tiên đóng circuit** (SRS 3.3.9 "auto-deactivate", NFR-20 auto-recovery) | `degraded` (connector lỗi: …) |
| Hàng đợi webhook tồn > `HEALTH_QUEUE_BACKLOG` (5 000) | Webhook trễ | Tăng worker (`--scale worker=N`, P7.4) | `degraded` |
| Backup cũ hơn `BACKUP_MAX_AGE_HOURS` (26) | RPO vượt mục tiêu | — | `degraded` (khi `BACKUP_MONITOR=true`) |
| Sentry / PagerDuty / SMTP lỗi | Mất báo lỗi / cảnh báo | Gửi không bao giờ chặn nghiệp vụ (timeout 3 s / 10 s, không ném lỗi); monitor ghi log + Sentry khi kênh cảnh báo lỗi | — |

## 6. Kế hoạch kiểm thử khôi phục (restore test plan)

### 6.1 Tự động — sau mỗi backup

`scripts/backup-verify.sh latest`: khôi phục vào `paymentdb_restore_check` (cùng server), rồi:

1. checksum mọi tệp (`SHA256SUMS`);
2. dump khôi phục không lỗi (đo `restoreSeconds`);
3. đủ bảng của manifest, số dòng khớp (khác = cảnh báo; bảng có dữ liệu mà khôi phục rỗng = lỗi);
4. đủ trigger + quy tắc append-only còn hiệu lực (`UPDATE audit_logs` bị từ chối);
5. cùng danh sách migration Prisma;
6. kho tệp giải nén được, đủ số tệp của manifest;

rồi xoá database tạm. Kết quả → `backup_runs` (kind `verify`). Lỗi → exit 1 (log của container `backup`).

### 6.2 Diễn tập hằng quý (thủ công, ghi biên bản)

| Bước | Việc | Tiêu chí đạt |
|------|------|--------------|
| 1 | Lấy bộ backup **từ off-site** (không dùng bản local) | Tải được, `SHA256SUMS` khớp |
| 2 | Dựng môi trường trống (máy / compose project khác) với secret từ Vault | — |
| 3 | `restore.sh … --target-db paymentdb --files`, `up -d --build` | Health `ok`; thời gian từ bước 2 → health ok ≤ RTO 1 giờ |
| 4 | Đăng nhập admin, mở 5 GD gần nhất, 1 tra soát có chứng từ (tải được tệp), danh sách đối tác (secret giải mã được — test kết nối) | Dữ liệu đúng, tệp đọc được |
| 5 | Gọi API merchant (tạo GD sandbox) bằng API key có sẵn | 201 |
| 6 | Ghi biên bản: bộ backup, RPO thực tế (giờ backup ↔ thời điểm giả định sự cố), RTO đo được, vấn đề | Lưu vào hồ sơ vận hành |

## 7. Giám sát & cảnh báo

### 7.1 Health endpoint

| Endpoint | Dùng cho | Trả về |
|----------|---------|--------|
| `GET /api/v1/health` | Uptime monitor, load balancer | `status` ok / degraded / down + trạng thái từng thành phần (database, redis, workers, realtime, queues, storage, connectors, backup). Chi tiết (thông báo, số worker, hàng đợi, backup gần nhất) khi có `X-Health-Token: $HEALTH_TOKEN` hoặc token admin. 503 chỉ khi `down`. Kết quả cache 5 s / instance (`HEALTH_CACHE_MS`) — không thành công cụ khuếch đại tải |
| `GET /api/health` | Docker healthcheck (readiness) | Như trên, định dạng P1.2 |
| `GET /api/health/live` | Liveness (process trả lời) | luôn 200 |
| Realtime `:4001/health` | Docker healthcheck | 503 khi mất kết nối Redis |
| Worker | Docker healthcheck | tệp heartbeat (`HEARTBEAT_FILE`) cập nhật ≤ 60 s — chỉ khi Redis nhận heartbeat |

Heartbeat worker / realtime: sorted set Redis `payhub:{hb}:worker|realtime` (10 s / lần, TTL 30 s).

### 7.2 Uptime monitor + cảnh báo

`node dist/monitor.mjs` (`npm run dev:monitor`; compose: `--profile monitoring`). **Production: chạy trên máy / vùng khác** hoặc dùng dịch vụ uptime bên ngoài (UptimeRobot, Better Stack…) gọi `/api/v1/health` — máy chủ chết thì không ai bên trong nó báo được.

- Đo mỗi `MONITOR_INTERVAL_S` (30 s), xác nhận sau `MONITOR_FAIL_THRESHOLD` (2) lần liên tiếp → cảnh báo khi đổi trạng thái: `down` = **critical**, `degraded` = **warning**, về `ok` = **resolve**.
- **PagerDuty** Events API v2 (`PAGERDUTY_ROUTING_KEY`; `dedup_key` = `payment-hub:<target>:<down|degraded>` → trigger / resolve cùng sự cố) và **email** (`MONITOR_ALERT_EMAILS`, SMTP của `lib/mail.ts`).
- Uptime theo ngày (giờ VN) lưu `MONITOR_STATE_FILE`; `node dist/monitor.mjs report` (hoặc `GET :4002/status`) in uptime 1 / 30 / 365 ngày, downtime, ngân sách 99,9 % còn lại, 5 sự cố gần nhất. Khoảng monitor ngừng chạy tính là "không đo", không tính downtime.

### 7.3 Sentry (APM lỗi)

`SENTRY_DSN` (trống = tắt) — client gọn theo giao thức envelope (`lib/sentry.ts`, không SDK): lỗi Next (`instrumentation.ts` `onRequestError`), lỗi hạ tầng API merchant (degraded 503), job worker thất bại lần cuối (trừ webhook — lỗi phía merchant), uncaught / unhandled của worker / realtime / monitor (rồi thoát 1 để Docker khởi động lại). Che secret (khoá tên nhạy cảm, URL có mật khẩu, `Bearer`, query string, chỉ header trong allowlist); ≤ 30 sự kiện / phút / tiến trình, lỗi giống nhau trong 60 s gửi 1 lần, tôn trọng 429. Nhãn: `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.

Cảnh báo nghiệp vụ (GD thất bại, webhook lỗi 5 lần, chênh lệch đối soát, connector down…) vẫn ở **trung tâm thông báo P7.3** (`/notifications`).

## 8. Đạt 99,9 % — các biện pháp

| Nguy cơ downtime | Biện pháp |
|------------------|-----------|
| Process chết | `restart: unless-stopped`; uncaught → thoát 1 → Docker khởi động lại; healthcheck mọi container |
| 1 instance app lỗi | App không trạng thái, chạy ≥ 2 instance sau load balancer (P7.4) — LB dùng `/api/v1/health` (503 = rút) |
| Deploy | Rolling: lên instance mới → health `ok` → rút instance cũ; migration Prisma phải tương thích ngược 1 phiên bản (thêm cột trước, xoá sau) |
| Redis / worker / đối tác lỗi | Không gây downtime (§5) |
| DB lỗi | Nguồn downtime chính: MariaDB HA (Galera / primary-replica + failover tự động) cho production; backup + restore (§4) khi mất dữ liệu |
| Mất máy chủ / vùng | Backup off-site + runbook §4.2; RTO ≤ 1 giờ ≈ 11 % ngân sách năm |
| Phát hiện muộn | Monitor ngoài hệ thống, xác nhận 1 phút, PagerDuty gọi trực |

Đo thực tế: `monitor.mjs report` hằng tháng; vượt ngân sách 30 ngày → rà soát sự cố (postmortem).

## 9. Checklist triển khai production

- [ ] `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_RELEASE=<git sha>`
- [ ] Monitor ngoài hệ thống: `MONITOR_TARGETS` (URL công khai mỗi instance + LB), `PAGERDUTY_ROUTING_KEY`, `MONITOR_ALERT_EMAILS`, `HEALTH_TOKEN` (giống app)
- [ ] `BACKUP_MONITOR=true`, `BACKUP_ENCRYPTION_KEY_FILE` (khoá trong Vault), `BACKUP_UPLOAD_CMD` (bucket khác vùng, object lock), user DB backup riêng (§3.6)
- [ ] MariaDB HA + `BACKUP_DB_SSL=true` khi DB có TLS
- [ ] Load balancer health check `/api/v1/health`, ≥ 2 instance app, ≥ 2 worker
- [ ] Bucket chứng từ: versioning + replication
- [ ] Diễn tập khôi phục đầu tiên (§6.2) trước go-live
- [ ] Các mục triển khai còn mở trong PROGRESS: #150 (Keycloak production), #151 (`TRUST_PROXY` sau reverse proxy), #166 (egress plugin), #172 (quyền user DB), #175 (đo tải trên hạ tầng thật), #177 (Redis Cluster failover)
