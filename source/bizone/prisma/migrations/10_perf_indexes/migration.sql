-- P6.5 — Rà soát index (chi tiết: scripts/database-indexing.sql).
-- Thêm index phủ cho truy vấn báo cáo / danh sách; bỏ index trùng lặp (trùng UNIQUE hoặc là
-- tiền tố của index khác) — chỉ làm chậm INSERT/UPDATE và tốn bộ nhớ đệm.
-- Index mới tạo TRƯỚC khi bỏ index cũ: InnoDB cần luôn có index cho cột khoá ngoại.

-- Báo cáo bán hàng (linesSql): quét theo ngày tạo + trạng thái, không phải đọc dòng HĐ
CREATE INDEX `idx_inv_report` ON `invoices`(`created_at`, `status`, `branch_id`, `user_id`, `total_amount`);
CREATE INDEX `idx_ii_report` ON `invoice_items`(`invoice_id`, `product_id`, `quantity`, `total_amount`, `cost_price`);
CREATE INDEX `idx_ip_report` ON `invoice_payments`(`invoice_id`, `payment_method`, `amount`);

-- Sắp xếp mặc định của danh sách (ORDER BY created_at DESC LIMIT 20 — trước đây filesort)
CREATE INDEX `idx_cust_created` ON `customers`(`created_at`);
CREATE INDEX `idx_product_created` ON `products`(`created_at`);

-- Danh sách tồn kho: ORDER BY warehouse_id, product_id
CREATE INDEX `idx_inv_wh_product` ON `inventory`(`warehouse_id`, `product_id`);

-- Index trùng UNIQUE cùng cột
DROP INDEX `idx_inv_code` ON `invoices`;
DROP INDEX `idx_ord_code` ON `orders`;
DROP INDEX `idx_product_barcode` ON `products`;
DROP INDEX `idx_product_sku` ON `products`;
DROP INDEX `idx_pv_sku` ON `product_variants`;
DROP INDEX `idx_cust_phone` ON `customers`;
DROP INDEX `idx_coupon_code` ON `coupons`;
DROP INDEX `idx_v_code` ON `vouchers`;

-- Index là tiền tố của index khác (index dài hơn phục vụ được cùng truy vấn)
DROP INDEX `idx_inv_created` ON `invoices`;
DROP INDEX `idx_ii_invoice` ON `invoice_items`;
DROP INDEX `idx_ip_invoice` ON `invoice_payments`;
DROP INDEX `idx_inv_product` ON `inventory`;
DROP INDEX `idx_inv_warehouse` ON `inventory`;
DROP INDEX `idx_ord_status` ON `orders`;
DROP INDEX `idx_ord_channel` ON `orders`;
DROP INDEX `idx_cc_channel` ON `channel_connections`;
DROP INDEX `idx_cpm_channel` ON `channel_product_mapping`;
DROP INDEX `idx_ocm_channel` ON `order_channel_mapping`;
DROP INDEX `idx_att_user` ON `attendance`;
DROP INDEX `idx_comm_user` ON `commissions`;
