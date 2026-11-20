-- P7.2: audit log of Payment Hub (SRS-PH-AUDIT-01 / 02).
--  audit_logs.actor_id: Keycloak subject of the admin (users.id / user_id stays NULL — Keycloak
--    users are not rows of `users`, like refunds.requested_by)
--  audit_logs.result: success | failure (rejected by validation / business rule / error) | denied
--  audit_logs.http_method / request_path: the admin API call that produced the entry
--
-- Append-only (SRS-PH-AUDIT-01-03, NFR-14): triggers refuse every UPDATE of the log tables and
-- every DELETE of a row younger than 90 days (the minimum retention, SRS-PH-AUDIT-01-04 / 02-03) —
-- whatever the client (app, script, SQL console). The retention job of the worker deletes older
-- audit_logs rows only. (InnoDB does not fire triggers for foreign-key cascades: removing a whole
-- transaction still removes its logs.)
ALTER TABLE `audit_logs`
  ADD COLUMN `actor_id` VARCHAR(64) NULL AFTER `user_id`,
  ADD COLUMN `result` ENUM('success','failure','denied') NOT NULL DEFAULT 'success' AFTER `action`,
  ADD COLUMN `http_method` VARCHAR(10) NULL AFTER `user_agent`,
  ADD COLUMN `request_path` VARCHAR(255) NULL AFTER `http_method`;

CREATE INDEX `idx_audit_username` ON `audit_logs`(`username`);
CREATE INDEX `idx_audit_entity_type_created` ON `audit_logs`(`entity_type`, `created_at`);

CREATE TRIGGER `trg_audit_logs_no_update` BEFORE UPDATE ON `audit_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

CREATE TRIGGER `trg_audit_logs_no_delete` BEFORE DELETE ON `audit_logs` FOR EACH ROW
  IF OLD.`created_at` > NOW() - INTERVAL 90 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs rows are kept at least 90 days';
  END IF;

CREATE TRIGGER `trg_transaction_logs_no_update` BEFORE UPDATE ON `transaction_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'transaction_logs is append-only';

CREATE TRIGGER `trg_transaction_logs_no_delete` BEFORE DELETE ON `transaction_logs` FOR EACH ROW
  IF OLD.`created_at` > NOW() - INTERVAL 90 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'transaction_logs rows are kept at least 90 days';
  END IF;

CREATE TRIGGER `trg_transaction_raw_data_no_update` BEFORE UPDATE ON `transaction_raw_data` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'transaction_raw_data is append-only';

CREATE TRIGGER `trg_transaction_raw_data_no_delete` BEFORE DELETE ON `transaction_raw_data` FOR EACH ROW
  IF OLD.`created_at` > NOW() - INTERVAL 90 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'transaction_raw_data rows are kept at least 90 days';
  END IF;

CREATE TRIGGER `trg_partner_config_logs_no_update` BEFORE UPDATE ON `partner_config_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'partner_config_logs is append-only';

CREATE TRIGGER `trg_partner_config_logs_no_delete` BEFORE DELETE ON `partner_config_logs` FOR EACH ROW
  IF OLD.`created_at` > NOW() - INTERVAL 90 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'partner_config_logs rows are kept at least 90 days';
  END IF;
