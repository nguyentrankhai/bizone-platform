-- P6.5 — Rà soát index & truy vấn BizOne (MariaDB 10.11)
--
-- Thay đổi index nằm ở migration prisma/migrations/10_perf_indexes (đã đồng bộ schema.prisma
-- và database/schema.sql). File này giữ phương pháp rà soát + các câu EXPLAIN để kiểm lại khi dữ
-- liệu lớn lên hoặc khi thêm truy vấn mới. Chạy trên DB tenant (vd. bộ dữ liệu đo
-- scripts/perf/seed-perf.sql):
--   docker exec -i mariadbtest mariadb -uroot -p… bizone_perf < scripts/database-indexing.sql
--
-- Kết quả rà soát (dữ liệu đo: 10k SP, 50k khách, 200k HĐ / 500k dòng, 30k đơn, 100k audit log):
--   * Báo cáo bán hàng (report.service `linesSql`) quét invoices theo created_at rồi tra từng dòng
--     HĐ → index phủ idx_inv_report + idx_ii_report: truy vấn 1 năm 2,2 s → 1,1 s (không đọc bảng).
--     Phần còn lại do cache "ngày đã qua" (lib/cache.ts, vùng salesHistory) xử lý.
--   * Danh sách khách / sản phẩm ORDER BY created_at DESC LIMIT 20 → filesort 50k dòng mỗi trang
--     → idx_cust_created, idx_product_created (customer.list P95 95 → 47 ms).
--   * Danh sách tồn ORDER BY warehouse_id, product_id → idx_inv_wh_product (thay idx_inv_warehouse).
--   * 19 index trùng lặp bị bỏ (trùng UNIQUE cùng cột, hoặc là tiền tố của index khác) — mỗi
--     INSERT hoá đơn / dòng HĐ / đơn hàng ghi ít index hơn. Câu truy vấn tìm index trùng ở cuối.
--   * Tìm kiếm `LIKE '%x%'` (tên / SĐT / mã) không dùng được B-tree; với quy mô SME (≤ 50k khách,
--     ≤ 10k SP) quét bảng < 60 ms. Khi vượt ~500k dòng: cân nhắc FULLTEXT (ngram) hoặc tìm theo
--     tiền tố (`LIKE 'x%'`) cho mã / SĐT.
--   * Truy vấn sửa ở tầng code (không cần index): lọc tồn thấp (so sánh 2 bảng trong SQL thay vì
--     tải 42k dòng), tìm đơn (lấy id khách trước thay cho relation filter của Prisma), báo cáo tồn
--     kho (GROUP BY trong SQL), ngày bán cuối của SP chậm (JOIN thay cho `invoice: { status }`
--     làm Prisma liệt kê mọi id HĐ), doanh thu 7 ngày của dashboard (GROUP BY ngày).

SET @from = UTC_DATE() - INTERVAL 30 DAY - INTERVAL 7 HOUR, @to = UTC_TIMESTAMP();

-- 1. Báo cáo bán hàng: i dùng idx_inv_report (Using index), ii dùng idx_ii_report (Using index)
EXPLAIN
SELECT DATE(i.created_at + INTERVAL 7 HOUR) AS d, SUM(ii.total_amount), COUNT(DISTINCT i.id)
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
JOIN products p ON p.id = ii.product_id
WHERE i.created_at >= @from AND i.created_at < @to AND i.status IN ('active', 'refunded')
GROUP BY d;

-- 2. Thanh toán theo phương thức: ip dùng idx_ip_report (Using index)
EXPLAIN
SELECT ip.payment_method, SUM(ip.amount)
FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id
WHERE i.created_at >= @from AND i.created_at < @to AND i.status IN ('active', 'refunded')
GROUP BY ip.payment_method;

-- 3. Danh sách khách / sản phẩm mặc định: index idx_*_created, không "Using filesort"
EXPLAIN SELECT id FROM customers ORDER BY created_at DESC LIMIT 20 OFFSET 40;
EXPLAIN SELECT id FROM products ORDER BY created_at DESC LIMIT 20;

-- 4. Danh sách tồn kho: idx_inv_wh_product, không filesort
EXPLAIN SELECT id FROM inventory ORDER BY warehouse_id, product_id LIMIT 20;

-- 5. Danh sách HĐ POS của chi nhánh (pos.invoices)
EXPLAIN SELECT id FROM invoices WHERE branch_id = 1 ORDER BY created_at DESC LIMIT 20;

-- 6. Danh sách đơn hàng (order.list) + đếm theo trạng thái
EXPLAIN SELECT id FROM orders ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT COUNT(*) FROM orders WHERE status = 'pending';

-- 7. Tồn thấp (inventory.list lowStock / summary)
EXPLAIN
SELECT i.id FROM inventory i JOIN products p ON p.id = i.product_id
WHERE p.min_stock > 0 AND i.quantity <= p.min_stock;

-- 8. Index trùng lặp còn lại (kết quả mong đợi: rỗng)
WITH ix AS (
  SELECT table_name t, index_name n, MIN(non_unique) nu,
         GROUP_CONCAT(column_name ORDER BY seq_in_index) cols
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
  GROUP BY table_name, index_name
)
SELECT a.t AS table_name, a.n AS redundant_index, a.cols, b.n AS covered_by, b.cols AS by_cols
FROM ix a JOIN ix b ON a.t = b.t AND a.n <> b.n
  AND (b.cols = a.cols OR b.cols LIKE CONCAT(a.cols, ',%'))
WHERE a.nu = 1
ORDER BY a.t;

-- 9. Kích thước bảng + index (theo dõi tăng trưởng)
SELECT table_name, table_rows,
       ROUND(data_length / 1048576, 1) AS data_mb, ROUND(index_length / 1048576, 1) AS index_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY data_length + index_length DESC
LIMIT 15;
