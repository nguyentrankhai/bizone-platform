-- P5.3: refund workflow.
--  requested_by / channel: who asked (merchant API key or admin token username — Keycloak users
--    are not rows of `users`, so processed_by stays NULL for them)
--  partner_refund_ref: merchant-side refund reference sent to the PSP (ZaloPay m_refund_id) used to
--    query an asynchronous refund; response_code: last PSP code
--  check_count / last_checked_at: worker polling of Processing refunds (syncPendingRefunds)
--  notify_webhook / webhook_sent_at: transactional outbox for `refund.completed` (like transactions)
ALTER TABLE `refunds`
  ADD COLUMN `partner_refund_ref` VARCHAR(255) NULL AFTER `partner_refund_id`,
  ADD COLUMN `response_code` VARCHAR(50) NULL AFTER `partner_refund_ref`,
  ADD COLUMN `requested_by` VARCHAR(100) NULL AFTER `processed_by`,
  ADD COLUMN `channel` ENUM('Merchant','Admin') NOT NULL DEFAULT 'Admin' AFTER `requested_by`,
  ADD COLUMN `internal_note` TEXT NULL AFTER `reason`,
  ADD COLUMN `check_count` INT NOT NULL DEFAULT 0 AFTER `error_message`,
  ADD COLUMN `last_checked_at` DATETIME NULL AFTER `check_count`,
  ADD COLUMN `notify_webhook` TINYINT(1) NOT NULL DEFAULT 0 AFTER `processed_at`,
  ADD COLUMN `webhook_sent_at` DATETIME NULL AFTER `notify_webhook`;

CREATE INDEX `idx_refund_outbox` ON `refunds`(`notify_webhook`, `webhook_sent_at`);
