-- P6.5 — Bộ dữ liệu đo hiệu năng (chỉ dùng cho DB riêng, KHÔNG chạy trên DB tenant thật).
--
-- Quy mô cửa hàng SME bận rộn, 3 chi nhánh, 1 năm hoạt động:
--   10 000 sản phẩm (2 000 SP có 3 biến thể), 30 000 dòng tồn kho, 50 000 khách hàng,
--   200 000 hoá đơn (~500 000 dòng), 30 000 đơn hàng, 100 000 dòng audit log.
--
-- Cách dùng (xem scripts/perf/README.md):
--   CREATE DATABASE bizone_perf …; prisma migrate deploy; SEED_TENANT_ID=tenant_perf npm run db:seed
--   docker exec -i mariadbtest mariadb -uroot -p… bizone_perf < scripts/perf/seed-perf.sql
--
-- Dữ liệu sinh bằng engine SEQUENCE (seq_1_to_N) + số học modulo → chạy lại trên DB trống cho
-- cùng kết quả. Ngày lưu UTC như app.

SET SESSION sql_log_bin = 0;
SET @now = UTC_TIMESTAMP();

-- ─── Chi nhánh, kho, nhân viên, danh mục ────────────────────────────────────────
INSERT INTO branches (name, code, status, is_default)
VALUES ('Chi nhánh Hà Nội', 'CN02', 'active', 0), ('Chi nhánh Đà Nẵng', 'CN03', 'active', 0);
INSERT INTO warehouses (branch_id, name, code, is_active)
SELECT b.id, CONCAT('Kho ', b.code), CONCAT('KHO-', b.code), 1 FROM branches b WHERE b.code IN ('CN02', 'CN03');

INSERT INTO users (username, password_hash, full_name, is_active)
SELECT CONCAT('perf.nv', seq), '!keycloak', CONCAT('Nhân viên ', seq), 1 FROM seq_1_to_30;
SET @u0 = (SELECT MIN(id) FROM users WHERE username LIKE 'perf.nv%');

INSERT INTO product_categories (name, slug, parent_id, sort_order, is_active)
SELECT CONCAT(c.name, ' — nhóm ', s.seq), CONCAT(c.slug, '-nhom-', s.seq), c.id, s.seq, 1
FROM product_categories c JOIN seq_1_to_5 s WHERE c.parent_id IS NULL;

-- ─── Sản phẩm (id 1..10 000; 8 001..10 000 có biến thể) ─────────────────────────
INSERT INTO products (name, sku, barcode, category_id, description, cost_price, selling_price,
                      tax_rate, unit, min_stock, status, track_inventory, created_at, updated_at)
SELECT
  CONCAT(ELT(1 + seq % 20, 'Áo thun', 'Quần jean', 'Váy hoa', 'Giày thể thao', 'Túi xách',
             'Nước ngọt', 'Sữa tươi', 'Bánh quy', 'Cà phê', 'Trà xanh', 'Son môi', 'Kem dưỡng',
             'Nồi cơm điện', 'Quạt đứng', 'Bút bi', 'Sổ tay', 'Tai nghe', 'Sạc dự phòng',
             'Ốp điện thoại', 'Mì gói'),
         ' ', ELT(1 + (seq DIV 20) % 8, 'đỏ', 'xanh', 'trắng', 'đen', 'vàng', 'hồng', 'cao cấp', 'mini'),
         ' ', seq),
  CONCAT('PF', LPAD(seq, 6, '0')),
  CONCAT('893', LPAD(seq, 10, '0')),
  (SELECT MIN(id) FROM product_categories WHERE parent_id IS NOT NULL) + seq % 40,
  'Sản phẩm sinh tự động cho đo hiệu năng',
  ROUND(5000 + (seq * 7919) % 400000, -2),
  ROUND((5000 + (seq * 7919) % 400000) * 1.35, -3),
  0, 'Cái', 10,
  IF(seq % 50 = 0, 'inactive', 'active'), 1,
  DATE_SUB(@now, INTERVAL 400 - seq % 365 DAY), @now
FROM seq_1_to_10000;

INSERT INTO product_variants (product_id, sku, barcode, cost_price, selling_price, status)
SELECT p.id, CONCAT(p.sku, '-', ELT(v.seq, 'S', 'M', 'L')), CONCAT('894', LPAD(p.id * 3 + v.seq, 10, '0')),
       p.cost_price, p.selling_price + (v.seq - 1) * 10000, 'active'
FROM products p JOIN seq_1_to_3 v WHERE p.id > 8000 ORDER BY p.id, v.seq;

-- ─── Tồn kho: mỗi SP / biến thể × 3 kho, ~5 % dưới mức tối thiểu ────────────────
INSERT INTO inventory (product_id, warehouse_id, variant_id, quantity, min_quantity)
SELECT p.id, w.id, NULL, IF((p.id + w.id) % 20 = 0, (p.id % 9), 20 + (p.id * 13 + w.id * 7) % 300), 10
FROM products p JOIN warehouses w WHERE p.id <= 8000;
INSERT INTO inventory (product_id, warehouse_id, variant_id, quantity, min_quantity)
SELECT v.product_id, w.id, v.id, 20 + (v.id * 17 + w.id) % 200, 10
FROM product_variants v JOIN warehouses w;

-- ─── Khách hàng ─────────────────────────────────────────────────────────────────
INSERT INTO customers (code, full_name, phone, email, gender, group_id, ranking, total_spent,
                       total_points, is_active, created_at, updated_at)
SELECT CONCAT('KHP', LPAD(seq, 6, '0')),
       CONCAT(ELT(1 + seq % 8, 'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'), ' ',
              ELT(1 + (seq DIV 8) % 6, 'Văn', 'Thị', 'Minh', 'Ngọc', 'Đức', 'Thu'), ' ',
              ELT(1 + (seq DIV 48) % 10, 'An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Lan', 'Minh', 'Nam', 'Tuấn', 'Yến')),
       CONCAT('09', LPAD(seq, 8, '0')),
       IF(seq % 3 = 0, CONCAT('kh', seq, '@example.com'), NULL),
       ELT(1 + seq % 3, 'male', 'female', 'other'),
       (SELECT id FROM customer_groups WHERE code = 'retail'),
       ELT(1 + IF(seq % 100 < 70, 0, IF(seq % 100 < 90, 1, IF(seq % 100 < 98, 2, 3))), 'silver', 'gold', 'vip', 'diamond'),
       (seq * 104729) % 50000000, (seq * 31) % 5000, 1,
       DATE_SUB(@now, INTERVAL seq % 400 DAY), @now
FROM seq_1_to_50000;

-- ─── Hoá đơn POS: 200 000 trong 365 ngày, phân bố đều theo giờ mở cửa ─────────────
INSERT INTO invoices (invoice_code, cash_session_id, customer_id, user_id, branch_id, subtotal,
                      discount_amount, total_amount, paid_amount, change_amount, status,
                      invoice_type, created_at, updated_at)
SELECT CONCAT('HDP', LPAD(seq, 9, '0')), NULL,
       IF(seq % 5 < 3, 1 + (seq * 13) % 50000, NULL),
       @u0 + seq % 30,
       (SELECT MIN(id) FROM branches) + seq % 3,
       0, 0, 0, 0, 0,
       IF(seq % 50 = 0, 'cancelled', IF(seq % 97 = 0, 'refunded', 'active')),
       'pos',
       -- ngày lùi dần từ hôm nay (≈ 548 HĐ / ngày), giờ 01:00–14:59 UTC = 08:00–21:59 giờ VN
       DATE_ADD(DATE_SUB(DATE(@now), INTERVAL seq DIV 548 DAY), INTERVAL 3600 + (seq * 7919) % 50400 SECOND),
       @now
FROM seq_1_to_200000;
-- HĐ "hôm nay" chưa tới giờ hiện tại thì kéo về trước
UPDATE invoices SET created_at = DATE_SUB(@now, INTERVAL (id % 3600) SECOND) WHERE created_at > @now;

INSERT INTO invoice_items (invoice_id, product_id, variant_id, unit_name, quantity, unit_price,
                           discount_amount, tax_amount, total_amount, cost_price, created_at)
SELECT i.id, p.id, IF(p.id > 8000, (p.id - 8001) * 3 + 1 + s.seq % 3, NULL), 'Cái', q.qty,
       p.selling_price, 0, 0, q.qty * p.selling_price, p.cost_price, i.created_at
FROM invoices i
JOIN seq_1_to_4 s ON s.seq <= 1 + i.id % 4
-- phân bố lệch: SP id nhỏ bán chạy hơn (tích 2 số đều / 10 000)
JOIN products p ON p.id = 1 + (((i.id * 31 + s.seq * 977) % 10000) * ((i.id * 7 + s.seq * 13) % 10000)) DIV 10000
JOIN (SELECT 1 + seq % 3 AS qty, seq FROM seq_0_to_3) q ON q.seq = (i.id + s.seq) % 4;

UPDATE invoices i
JOIN (SELECT invoice_id, SUM(total_amount) t FROM invoice_items GROUP BY invoice_id) x ON x.invoice_id = i.id
SET i.subtotal = x.t, i.total_amount = x.t, i.paid_amount = x.t;

INSERT INTO invoice_payments (invoice_id, payment_method, amount, created_at)
SELECT id, ELT(1 + id % 4, 'cash', 'transfer', 'card', 'qr'), total_amount, created_at FROM invoices;

-- ─── Đơn hàng đa kênh: 30 000 ───────────────────────────────────────────────────
INSERT INTO orders (order_code, customer_id, contact_name, contact_phone, channel, source, branch_id,
                    subtotal, shipping_fee, discount_amount, total_amount, payment_method,
                    payment_status, status, shipping_address, created_at, updated_at)
SELECT CONCAT('ORDP-', LPAD(seq, 8, '0')),
       IF(seq % 4 = 0, NULL, 1 + (seq * 17) % 50000),
       CONCAT('Khách ', seq), CONCAT('08', LPAD(seq, 8, '0')),
       ELT(1 + seq % 5, 'website', 'shopee', 'lazada', 'tiktok', 'website'),
       IF(seq % 5 = 4, 'facebook', NULL),
       (SELECT MIN(id) FROM branches) + seq % 3,
       0, 30000, 0, 0, ELT(1 + seq % 2, 'cod', 'online'),
       IF(seq % 3 = 0, 'paid', 'unpaid'),
       ELT(1 + IF(seq < 300, seq % 4, 4 + seq % 4), 'pending', 'confirmed', 'preparing', 'shipping',
           'completed', 'completed', 'cancelled', 'delivered'),
       CONCAT(seq, ' Đường Láng, Hà Nội'),
       DATE_SUB(@now, INTERVAL seq * 1051 SECOND), @now
FROM seq_1_to_30000;

INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_amount, created_at)
SELECT o.id, p.id, IF(p.id > 8000, (p.id - 8001) * 3 + 1, NULL), 1 + s.seq % 2, p.selling_price,
       (1 + s.seq % 2) * p.selling_price, o.created_at
FROM orders o JOIN seq_1_to_3 s ON s.seq <= 1 + o.id % 3
JOIN products p ON p.id = 1 + (o.id * 53 + s.seq * 211) % 10000;

UPDATE orders o
JOIN (SELECT order_id, SUM(total_amount) t FROM order_items GROUP BY order_id) x ON x.order_id = o.id
SET o.subtotal = x.t, o.total_amount = x.t + o.shipping_fee;

-- ─── Audit log: 100 000 ─────────────────────────────────────────────────────────
INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, new_value, ip_address, created_at)
SELECT @u0 + seq % 30, ELT(1 + seq % 3, 'create', 'update', 'delete'),
       ELT(1 + seq % 5, 'product', 'order', 'customer', 'inventory', 'pos'),
       ELT(1 + seq % 5, 'product', 'order', 'customer', 'inventory', 'invoice'),
       1 + seq % 10000, '{"perf":true}', '127.0.0.1', DATE_SUB(@now, INTERVAL seq * 300 SECOND)
FROM seq_1_to_100000;

ANALYZE TABLE products, product_variants, inventory, customers, invoices, invoice_items,
              invoice_payments, orders, order_items, audit_logs;
