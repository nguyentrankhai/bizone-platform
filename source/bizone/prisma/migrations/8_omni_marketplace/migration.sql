-- P6.2: Omni Channel — Shopee / Lazada connectors

-- Connection state of a marketplace shop (tokens are stored encrypted in access_token / refresh_token)
ALTER TABLE `channel_connections`
    ADD COLUMN `refresh_expires_at` DATETIME(0) NULL AFTER `token_expires_at`,
    ADD COLUMN `last_order_sync_at` DATETIME(0) NULL AFTER `last_sync_at`,
    ADD COLUMN `last_error` TEXT NULL AFTER `last_order_sync_at`,
    ADD COLUMN `connected_by` INTEGER NULL AFTER `last_error`,
    ADD INDEX `idx_cc_shop`(`channel_code`, `shop_id`);

-- Listing of a product / variant on a marketplace: item id + model (variation) id, last pushed price / stock
ALTER TABLE `channel_product_mapping`
    ADD COLUMN `channel_model_id` VARCHAR(100) NULL AFTER `channel_product_id`,
    ADD COLUMN `sync_status` ENUM('pending', 'synced', 'error') NOT NULL DEFAULT 'pending' AFTER `is_active`,
    ADD COLUMN `last_error` TEXT NULL AFTER `sync_status`,
    ADD INDEX `idx_cpm_listing`(`channel_id`, `channel_product_id`),
    ADD INDEX `idx_cpm_sku`(`channel_id`, `channel_sku`);

-- One BizOne order per marketplace order (imports from push + polling race safely)
ALTER TABLE `order_channel_mapping`
    ADD COLUMN `channel_status` VARCHAR(50) NULL AFTER `channel_order_data`,
    ADD COLUMN `channel_updated_at` DATETIME(0) NULL AFTER `channel_status`,
    ADD UNIQUE INDEX `uq_ocm_channel_order`(`channel_id`, `channel_order_id`);
