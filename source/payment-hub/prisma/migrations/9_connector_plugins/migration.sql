-- P7.1: Connector plugin architecture.
--  connectors.source: builtin (compiled into Payment Hub — VNPay, MoMo, ZaloPay, VietQR) or plugin
--    (signed zip uploaded at /connectors, executed in a sandboxed child process)
--  connectors.connector_type: partner_configs.connector_type served by a plugin (built-ins keep
--    the mapping in code)
--  connectors.current_package_id: connector_packages row in use (plugins)
--  connectors.health_*: last health check (worker Health Monitor + "check now" in the UI)
--  connector_packages: every uploaded version (zip kept in DB so every process / instance can
--    load it — no shared file system needed); the signature is verified again on every load
--  connector_health_logs: health check history (connector code, optional partner config)
ALTER TABLE `connectors`
  ADD COLUMN `source` ENUM('builtin','plugin') NOT NULL DEFAULT 'builtin' AFTER `code`,
  ADD COLUMN `connector_type` VARCHAR(50) NULL AFTER `source`,
  ADD COLUMN `current_package_id` INT NULL AFTER `config_schema`,
  ADD COLUMN `last_error` VARCHAR(1000) NULL AFTER `is_active`,
  ADD COLUMN `health_status` ENUM('Healthy','Degraded','Unhealthy') NULL AFTER `last_error`,
  ADD COLUMN `health_message` VARCHAR(500) NULL AFTER `health_status`,
  ADD COLUMN `health_latency_ms` INT NULL AFTER `health_message`,
  ADD COLUMN `health_checked_at` DATETIME NULL AFTER `health_latency_ms`,
  ADD COLUMN `activated_at` DATETIME NULL AFTER `health_checked_at`,
  ADD COLUMN `updated_by` VARCHAR(100) NULL AFTER `activated_at`;

CREATE UNIQUE INDEX `uq_connectors_type` ON `connectors`(`connector_type`);

CREATE TABLE `connector_packages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `connector_code` VARCHAR(50) NOT NULL,
  `version` VARCHAR(50) NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `size` INT NOT NULL,
  `manifest` JSON NOT NULL,
  `package` LONGBLOB NOT NULL,
  `publisher_key` VARCHAR(100) NOT NULL,
  `uploaded_by` VARCHAR(100) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_connector_package_version` (`connector_code`, `version`),
  INDEX `idx_connector_package_code` (`connector_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `connector_health_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `connector_code` VARCHAR(50) NOT NULL,
  `partner_config_id` INT NULL,
  `status` ENUM('Healthy','Degraded','Unhealthy') NOT NULL,
  `latency_ms` INT NULL,
  `message` VARCHAR(500) NULL,
  `checked_by` VARCHAR(100) NULL,
  `checked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_chealth_code_time` (`connector_code`, `checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
