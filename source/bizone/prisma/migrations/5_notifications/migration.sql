-- P4.7: notifications (in-app + email + SMS + web push), delivery log, marketing campaigns

-- In-app notifications = event log. Visible to `user_id` (personal) or to everyone holding the
-- `audience` capability within `branch_id` (NULL = every branch). Kept 30 days.
CREATE TABLE `notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL DEFAULT 'info',
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NULL,
    `link` VARCHAR(500) NULL,
    `audience` VARCHAR(50) NULL,
    `user_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `data` TEXT NULL,
    `dedupe_key` VARCHAR(191) NULL,
    `show_in_app` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_notif_dedupe`(`dedupe_key`),
    INDEX `idx_notif_created`(`created_at`),
    INDEX `idx_notif_user`(`user_id`, `created_at`),
    INDEX `idx_notif_audience`(`audience`, `created_at`),
    INDEX `idx_notif_branch`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_reads` (
    `notification_id` BIGINT NOT NULL,
    `user_id` INTEGER NOT NULL,
    `read_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nr_user`(`user_id`),
    PRIMARY KEY (`notification_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Store-level channel configuration per event type (missing row = defaults in code)
CREATE TABLE `notification_settings` (
    `event_type` VARCHAR(50) NOT NULL,
    `in_app` BOOLEAN NOT NULL DEFAULT true,
    `email` BOOLEAN NOT NULL DEFAULT false,
    `sms` BOOLEAN NOT NULL DEFAULT false,
    `push` BOOLEAN NOT NULL DEFAULT false,
    `email_to` TEXT NULL,
    `sms_to` TEXT NULL,
    `email_template` VARCHAR(100) NULL,
    `sms_template` VARCHAR(100) NULL,
    `options` TEXT NULL,
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`event_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Personal preferences (mute an event type in the bell / on push)
CREATE TABLE `notification_preferences` (
    `user_id` INTEGER NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `in_app` BOOLEAN NOT NULL DEFAULT true,
    `push` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`user_id`, `event_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Web Push subscriptions (one per browser); roles = token realm roles at subscribe time
CREATE TABLE `push_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `roles` VARCHAR(500) NOT NULL DEFAULT '',
    `endpoint` VARCHAR(1000) NOT NULL,
    `endpoint_hash` CHAR(64) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `failure_count` INTEGER NOT NULL DEFAULT 0,
    `last_success_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_push_endpoint`(`endpoint_hash`),
    INDEX `idx_push_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Marketing campaigns (SRS-MKT-06): bulk email / SMS to a customer segment
CREATE TABLE `marketing_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `subject` VARCHAR(500) NULL,
    `content` TEXT NOT NULL,
    `audience` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `scheduled_at` DATETIME(0) NULL,
    `started_at` DATETIME(0) NULL,
    `completed_at` DATETIME(0) NULL,
    `total_recipients` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_mc_status`(`status`),
    INDEX `idx_mc_created`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Outgoing email / SMS / push log (events, report emails, campaigns, tests). Kept 30 days.
CREATE TABLE `notification_deliveries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `notification_id` BIGINT NULL,
    `campaign_id` INTEGER NULL,
    `customer_id` INTEGER NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `recipient` VARCHAR(1000) NOT NULL,
    `template_code` VARCHAR(100) NULL,
    `subject` VARCHAR(500) NULL,
    `content` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `provider` VARCHAR(50) NULL,
    `provider_message_id` VARCHAR(255) NULL,
    `error` VARCHAR(1000) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nd_created`(`created_at`),
    INDEX `idx_nd_notification`(`notification_id`),
    INDEX `idx_nd_campaign`(`campaign_id`, `status`),
    INDEX `idx_nd_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notif_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `notification_reads` ADD CONSTRAINT `fk_nr_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `notification_reads` ADD CONSTRAINT `fk_nr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `notification_preferences` ADD CONSTRAINT `fk_np_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `fk_push_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `marketing_campaigns` ADD CONSTRAINT `fk_mc_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `fk_nd_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `fk_nd_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `marketing_campaigns`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- Amounts are formatted with the currency sign (fmtVnd) → drop the hard-coded "đ" of the seed text
UPDATE `notification_templates` SET `content` = REPLACE(`content`, '{{remaining_amount}}đ', '{{remaining_amount}}')
WHERE `template_code` = 'debt_reminder_sms';

-- Default templates for the new events (existing codes are kept as they are)
INSERT IGNORE INTO `notification_templates` (`template_code`, `template_name`, `channel`, `subject`, `content`, `variables`) VALUES
('order_new_email', 'Đơn hàng mới (email)', 'email', '[{{store_name}}] Đơn hàng mới {{order_code}} - {{total_amount}}', 'Có đơn hàng mới {{order_code}} từ kênh {{channel}}.\nKhách hàng: {{customer_name}}\nTổng tiền: {{total_amount}}\n\nXem đơn: {{link}}', 'store_name,order_code,channel,customer_name,total_amount,link'),
('order_new_sms', 'Đơn hàng mới (SMS)', 'sms', NULL, '{{store_name}}: don moi {{order_code}} ({{channel}}) {{total_amount}}', 'store_name,order_code,channel,total_amount'),
('low_stock_email', 'Cảnh báo tồn kho (email)', 'email', '[{{store_name}}] {{product_name}} sắp hết hàng', '{{product_name}} ({{sku}}) tại {{warehouse_name}} chỉ còn {{quantity}} (tối thiểu {{min_stock}}).\n\n{{link}}', 'store_name,product_name,sku,warehouse_name,quantity,min_stock,link'),
('stock_take_email', 'Kiểm kê chênh lệch (email)', 'email', '[{{store_name}}] Kiểm kê {{stock_take_code}} chênh lệch {{diff_count}} SP', 'Phiếu kiểm kê {{stock_take_code}} tại {{warehouse_name}} đã hoàn tất với {{diff_count}} sản phẩm chênh lệch (thừa {{surplus}}, thiếu {{shortage}}).\n\n{{link}}', 'store_name,stock_take_code,warehouse_name,diff_count,surplus,shortage,link'),
('debt_overdue_sms_staff', 'Công nợ khách quá hạn (SMS nội bộ)', 'sms', NULL, '{{store_name}}: KH {{customer_name}} no {{remaining_amount}} qua han {{days_overdue}} ngay (han {{due_date}})', 'store_name,customer_name,remaining_amount,days_overdue,due_date'),
('supplier_debt_email', 'Công nợ nhà cung cấp (email)', 'email', '[{{store_name}}] {{title}}', '{{content}}\nNhà cung cấp: {{supplier_name}}\nĐơn nhập: {{po_code}}\nCòn nợ: {{remaining_amount}}\nHạn thanh toán: {{due_date}}\n\n{{link}}', 'store_name,title,content,supplier_name,po_code,remaining_amount,due_date,link'),
('report_scheduled_email', 'Báo cáo định kỳ (email)', 'email', '[{{store_name}}] {{report_name}} {{period}}', 'Báo cáo {{report_name}} kỳ {{period}}.\nDoanh thu thuần: {{net_revenue}}\nSố hóa đơn: {{invoice_count}}\nLợi nhuận gộp: {{profit}}\n\nFile chi tiết đính kèm.', 'store_name,report_name,period,net_revenue,invoice_count,profit'),
('shift_reminder_sms', 'Nhắc ca làm việc (SMS)', 'sms', NULL, '{{store_name}}: ca {{shift_name}} cua ban bat dau luc {{start_time}} ngay {{date}}', 'store_name,shift_name,start_time,date'),
('preorder_due_sms', 'Nhắc khách nhận đơn đặt trước (SMS)', 'sms', NULL, '{{store_name}} xin thong bao: don dat truoc {{preorder_code}} cua quy khach hen giao ngay {{due_date}}. Con lai {{remaining_amount}}. Cam on quy khach!', 'store_name,preorder_code,due_date,remaining_amount,customer_name'),
('generic_email', 'Thông báo chung (email)', 'email', '[{{store_name}}] {{title}}', '{{content}}\n\n{{link}}', 'store_name,title,content,link'),
('generic_sms', 'Thông báo chung (SMS)', 'sms', NULL, '{{store_name}}: {{title}}. {{content}}', 'store_name,title,content');
