-- P4.4: automatic promotions applied at the POS (flash sale / buy X get Y / combo)
CREATE TABLE `promotion_usage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `promotion_type` ENUM('flash_sale', 'buy_x_get_y', 'combo') NOT NULL,
    `promotion_id` INTEGER NOT NULL,
    `item_ref_id` INTEGER NULL,
    `invoice_id` INTEGER NOT NULL,
    `customer_id` INTEGER NULL,
    `product_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL,
    `discount_amount` DECIMAL(15, 2) NOT NULL,
    `used_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_pu_promotion`(`promotion_type`, `promotion_id`),
    INDEX `idx_pu_invoice`(`invoice_id`),
    INDEX `fk_pu_customer`(`customer_id`),
    INDEX `idx_pu_used`(`used_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `promotion_usage` ADD CONSTRAINT `fk_pu_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `promotion_usage` ADD CONSTRAINT `fk_pu_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- P4.4: which personal voucher a coupon usage came from (restored when the invoice is cancelled)
ALTER TABLE `coupon_usage` ADD COLUMN `voucher_id` INTEGER NULL;
CREATE INDEX `fk_cu_voucher` ON `coupon_usage`(`voucher_id`);
ALTER TABLE `coupon_usage` ADD CONSTRAINT `fk_cu_voucher` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
