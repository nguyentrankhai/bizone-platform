-- P6.1: Omni Channel — website (store.bizone.vn)

-- Website customer accounts: one login (phone + password) per CRM customer
CREATE TABLE `customer_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(0) NULL,
    `last_login_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_cacc_customer`(`customer_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_cacc_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Online payments of an order through Payment Hub (merchant_txn_id = WEB-{tenant}-{id})
CREATE TABLE `order_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `merchant_txn_id` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('pending', 'success', 'failed', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
    `payhub_txn_code` VARCHAR(50) NULL,
    `payhub_method` VARCHAR(50) NULL,
    `payment_url` TEXT NULL,
    `partner_txn_id` VARCHAR(100) NULL,
    `paid_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `last_checked_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_op_merchant_txn`(`merchant_txn_id`),
    INDEX `idx_op_order`(`order_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_op_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Orders: receiver contact, warehouse the stock was taken from (NULL = not taken yet),
-- invoice written when the order is completed (revenue), deadline of an online payment
ALTER TABLE `orders`
    ADD COLUMN `contact_name` VARCHAR(255) NULL AFTER `customer_id`,
    ADD COLUMN `contact_phone` VARCHAR(20) NULL AFTER `contact_name`,
    ADD COLUMN `stock_warehouse_id` INTEGER NULL AFTER `branch_id`,
    ADD COLUMN `invoice_id` INTEGER NULL AFTER `stock_warehouse_id`,
    ADD COLUMN `payment_due_at` DATETIME(0) NULL AFTER `payment_status`,
    ADD UNIQUE INDEX `uq_ord_invoice`(`invoice_id`),
    ADD INDEX `idx_ord_payment_due`(`status`, `payment_due_at`),
    ADD CONSTRAINT `fk_ord_stock_wh` FOREIGN KEY (`stock_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT `fk_ord_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Coupon / promotion usage reserved by an order (invoice filled in when the order completes)
ALTER TABLE `coupon_usage`
    ADD COLUMN `order_id` INTEGER NULL AFTER `invoice_id`,
    ADD INDEX `idx_cu_order`(`order_id`),
    ADD CONSTRAINT `fk_cu_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `promotion_usage`
    MODIFY `invoice_id` INTEGER NULL,
    ADD COLUMN `order_id` INTEGER NULL AFTER `invoice_id`,
    ADD INDEX `idx_pu_order`(`order_id`),
    ADD CONSTRAINT `fk_pu_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
