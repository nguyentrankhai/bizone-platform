-- P3.6: group webhook attempts/replays of one message (X-Webhook-Id)
ALTER TABLE `webhook_logs` ADD COLUMN `delivery_id` VARCHAR(64) NULL AFTER `transaction_id`;
CREATE INDEX `idx_whlog_delivery` ON `webhook_logs`(`delivery_id`);
