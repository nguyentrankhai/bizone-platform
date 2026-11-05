-- P3.8: Route Engine — per-merchant partner priority
CREATE TABLE `merchant_routes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `merchant_id` INTEGER NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL,
  `partner_config_id` INTEGER NOT NULL,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,

  UNIQUE INDEX `uq_mroute`(`merchant_id`, `payment_method`, `partner_config_id`),
  INDEX `idx_mroute_partner`(`partner_config_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `merchant_routes` ADD CONSTRAINT `fk_mroute_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `merchant_routes` ADD CONSTRAINT `fk_mroute_partner` FOREIGN KEY (`partner_config_id`) REFERENCES `partner_configs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
