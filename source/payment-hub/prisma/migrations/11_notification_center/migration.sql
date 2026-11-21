-- P7.3: notification center of Payment Hub (SRS §9, SRS-PH-NOTIF-01..04).
-- The P1 `notifications` table was never used and tied each row to `users` (Keycloak admins are
-- not rows of `users`) → replaced by:
--  notifications: one row per event occurrence, visible to an audience (all admin-console users /
--    payhub-admin only), optionally scoped to one merchant; dedupe_key makes an event notify once;
--    email_status tracks the e-mail copy (worker); in_app = 0 for e-mail-only events (kept as
--    history, not shown in the center)
--  notification_reads: read state per Keycloak user (sub)
--  notification_settings: per event — in-app / e-mail on/off, threshold + window, e-mail recipients
--    (no row = defaults in services/notification/events.ts)
DROP TABLE IF EXISTS `notifications`;

CREATE TABLE `notifications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event` VARCHAR(50) NOT NULL,
  `severity` ENUM('Success','Warning','Error','Info') NOT NULL DEFAULT 'Info',
  `audience` ENUM('all','admin') NOT NULL DEFAULT 'all',
  `merchant_id` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NULL,
  `link` VARCHAR(255) NULL,
  `reference_type` VARCHAR(50) NULL,
  `reference_id` VARCHAR(100) NULL,
  `data` JSON NULL,
  `in_app` TINYINT(1) NOT NULL DEFAULT 1,
  `dedupe_key` VARCHAR(150) NULL,
  `email_status` ENUM('none','pending','sent','failed') NOT NULL DEFAULT 'none',
  `email_error` VARCHAR(500) NULL,
  `email_sent_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_notification_dedupe` (`dedupe_key`),
  INDEX `idx_notification_created` (`created_at`),
  INDEX `idx_notification_inapp_created` (`in_app`, `created_at`),
  INDEX `idx_notification_event_created` (`event`, `created_at`),
  INDEX `idx_notification_merchant_created` (`merchant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification_reads` (
  `notification_id` BIGINT NOT NULL,
  `user_sub` VARCHAR(64) NOT NULL,
  `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`, `user_sub`),
  INDEX `idx_notification_reads_user` (`user_sub`),
  CONSTRAINT `fk_notification_read` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification_settings` (
  `event` VARCHAR(50) NOT NULL,
  `in_app` TINYINT(1) NOT NULL DEFAULT 1,
  `email` TINYINT(1) NOT NULL DEFAULT 0,
  `threshold` INT NULL,
  `window_minutes` INT NULL,
  `email_to` VARCHAR(500) NULL,
  `updated_by` VARCHAR(100) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
