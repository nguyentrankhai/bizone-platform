-- P3.5: who changed a partner config (admin token username)
ALTER TABLE `partner_config_logs` ADD COLUMN `changed_by` VARCHAR(100) NULL AFTER `ip_address`;
