-- P6.3: Omni Channel — TikTok Shop + Facebook / Instagram

-- Platform handle that goes with the shop id on every call (TikTok Shop shop_cipher, Meta business id)
ALTER TABLE `channel_connections`
    ADD COLUMN `shop_ref` VARCHAR(255) NULL AFTER `shop_id`;

-- Where a website order came from (utm_source of the link the buyer followed: facebook, instagram, zalo…)
ALTER TABLE `orders`
    ADD COLUMN `source` VARCHAR(50) NULL AFTER `channel_order_id`,
    ADD INDEX `idx_ord_source`(`channel`, `source`);
