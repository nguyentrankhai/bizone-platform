-- P4.5: POS advanced — card/QR payments via Payment Hub (intents) and pre-orders with deposit
-- CreateTable
CREATE TABLE `pos_payment_intents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cash_session_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `method` ENUM('qr', 'card') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('pending', 'success', 'failed', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
    `merchant_txn_id` VARCHAR(100) NOT NULL,
    `payhub_txn_code` VARCHAR(50) NULL,
    `payhub_method` VARCHAR(50) NULL,
    `qr_data` TEXT NULL,
    `payment_url` VARCHAR(1000) NULL,
    `partner_txn_id` VARCHAR(255) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `invoice_id` INTEGER NULL,
    `preorder_id` INTEGER NULL,
    `expires_at` DATETIME(0) NULL,
    `paid_at` DATETIME(0) NULL,
    `last_checked_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_ppi_merchant_txn`(`merchant_txn_id`),
    INDEX `idx_ppi_session`(`cash_session_id`, `status`),
    INDEX `idx_ppi_invoice`(`invoice_id`),
    INDEX `idx_ppi_preorder`(`preorder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `preorders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `preorder_code` VARCHAR(50) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `cash_session_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `estimated_total` DECIMAL(15, 2) NOT NULL,
    `deposit_amount` DECIMAL(15, 2) NOT NULL,
    `deposit_method` VARCHAR(50) NOT NULL,
    `deposit_reference` VARCHAR(255) NULL,
    `due_date` DATE NULL,
    `status` ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `invoice_id` INTEGER NULL,
    `refund_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `refund_method` VARCHAR(50) NULL,
    `closed_session_id` INTEGER NULL,
    `notes` TEXT NULL,
    `completed_at` DATETIME(0) NULL,
    `cancelled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_po_code`(`preorder_code`),
    INDEX `idx_preo_status`(`status`, `due_date`),
    INDEX `fk_preo_session`(`cash_session_id`),
    INDEX `idx_preo_closed_session`(`closed_session_id`),
    INDEX `fk_preo_customer`(`customer_id`),
    INDEX `fk_preo_branch`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `preorder_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `preorder_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `variant_id` INTEGER NULL,
    `quantity` DECIMAL(15, 2) NOT NULL,
    `unit_price` DECIMAL(15, 2) NOT NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `total_amount` DECIMAL(15, 2) NOT NULL,

    INDEX `fk_preoi_preorder`(`preorder_id`),
    INDEX `fk_preoi_product`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pos_payment_intents` ADD CONSTRAINT `fk_ppi_session` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `preorders` ADD CONSTRAINT `fk_preo_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `preorders` ADD CONSTRAINT `fk_preo_session` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `preorders` ADD CONSTRAINT `fk_preo_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `preorder_items` ADD CONSTRAINT `fk_preoi_preorder` FOREIGN KEY (`preorder_id`) REFERENCES `preorders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `preorder_items` ADD CONSTRAINT `fk_preoi_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

