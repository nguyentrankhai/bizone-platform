# Đo hiệu năng BizOne (P6.5)

Bộ dữ liệu lớn + script đo thời gian phản hồi API. Chạy trên **DB riêng** — không bao giờ trên DB tenant thật.

## 1. Tạo DB đo (`bizone_perf`, tenant `tenant_perf`)

```bash
cd source/bizone
docker exec mariadbtest mariadb -uroot -pmypass -e "CREATE DATABASE bizone_perf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
export DATABASE_URL="mysql://root:mypass@localhost:3306/bizone_perf" TENANT_DATABASES="tenant_demo=bizonedb,tenant_perf=bizone_perf"
npx prisma migrate deploy
SEED_TENANT_ID=tenant_perf npm run db:seed
docker exec -i mariadbtest mariadb -uroot -pmypass bizone_perf < scripts/perf/seed-perf.sql
```

Quy mô: 10 000 SP (2 000 có 3 biến thể), 42 000 dòng tồn, 50 000 khách, 200 000 hoá đơn / 500 000 dòng trong 365 ngày, 30 000 đơn, 100 000 audit log (~7 s).

## 2. Chạy app production trỏ vào tenant đo

```bash
unset DATABASE_URL   # app lấy host / mật khẩu từ .env.local, DB theo TENANT_DATABASES
export TENANT_DATABASES="tenant_demo=bizonedb,tenant_perf=bizone_perf"
npm run build && npx next start -p 3001
```

Token: user Keycloak (realm `bizone`) có thuộc tính `tenant_id = tenant_perf` và vai trò `bizone-admin` (tạo trong admin console), đăng nhập bằng script (P6.7 — không còn chế độ bỏ qua đăng nhập; token sống 15 phút):

```bash
export BENCH_TOKEN=$(KC_PASSWORD=… node scripts/auth/login.mjs --user perf.admin@bizone.vn)
```

## 3. Đo

```bash
node scripts/perf/bench.mjs --url http://localhost:3001 --tenant tenant_perf --runs 40 --concurrency 4
node scripts/perf/bench.mjs --only "reports.revenue(365d),dashboard.summary" --json bench.json
```

Mỗi dòng in lần gọi đầu (cache lạnh với input đó) và P50 / P95 / max của các lần sau. Muốn đo cache lạnh hoàn toàn: tăng phiên bản vùng cache, vd. `docker exec redis redis-cli -a 123456 INCR cache:tenant_perf:salesHistory:ver`.

Rà soát index / EXPLAIN: `scripts/database-indexing.sql`.

## 4. Dọn dẹp

```bash
docker exec mariadbtest mariadb -uroot -pmypass -e "DROP DATABASE bizone_perf"
# khoá cache chứa JSON (dấu ngoặc kép) → xoá bằng Lua thay vì xargs
docker exec redis redis-cli -a 123456 EVAL "local k = redis.call('KEYS', ARGV[1]); for i = 1, #k do redis.call('DEL', k[i]) end; return #k" 0 '*tenant_perf*'
```
