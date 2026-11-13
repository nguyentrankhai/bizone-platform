-- P5.6: disputes (tra soát).
--  created_by_name / resolved_by_name: admin token username — Keycloak users are not rows of
--    `users`, so created_by / resolved_by (FK users) stay NULL for them (like refunds.requested_by)
--  notify_email: creator's e-mail (token claim) — receives the result notification
--  submit_channel / submitted_at / partner_ref: how and when the dispute was sent to the partner
--    (connector API, e-mail to partner_configs.dispute_email, or recorded manually) + partner ticket
--  notify_webhook / webhook_sent_at: transactional outbox for the `dispute.resolved` webhook
--  dispute_logs: timeline of a dispute (created, submitted, partner response, status, attachments)
--  partner_configs.dispute_email: partner support address(es) that receive disputes by e-mail
ALTER TABLE `disputes`
  ADD COLUMN `submit_channel` ENUM('Api','Email','Manual') NULL AFTER `submitted_to_partner`,
  ADD COLUMN `submitted_at` DATETIME NULL AFTER `submit_channel`,
  ADD COLUMN `partner_ref` VARCHAR(255) NULL AFTER `submitted_at`,
  ADD COLUMN `created_by_name` VARCHAR(100) NULL AFTER `created_by`,
  ADD COLUMN `notify_email` VARCHAR(255) NULL AFTER `created_by_name`,
  ADD COLUMN `resolved_by_name` VARCHAR(100) NULL AFTER `resolved_by`,
  ADD COLUMN `notify_webhook` TINYINT(1) NOT NULL DEFAULT 0 AFTER `resolved_at`,
  ADD COLUMN `webhook_sent_at` DATETIME NULL AFTER `notify_webhook`;

CREATE INDEX `idx_dispute_outbox` ON `disputes`(`notify_webhook`, `webhook_sent_at`);
CREATE INDEX `idx_dispute_created` ON `disputes`(`created_at`);

ALTER TABLE `dispute_attachments`
  ADD COLUMN `uploaded_by` VARCHAR(100) NULL AFTER `file_size`;

CREATE TABLE `dispute_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `dispute_id` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `from_status` VARCHAR(20) NULL,
  `to_status` VARCHAR(20) NULL,
  `note` TEXT NULL,
  `data` JSON NULL,
  `created_by` VARCHAR(100) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_dlog_dispute` (`dispute_id`),
  CONSTRAINT `fk_dlog_dispute` FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `partner_configs`
  ADD COLUMN `dispute_email` VARCHAR(500) NULL AFTER `webhook_url`;
