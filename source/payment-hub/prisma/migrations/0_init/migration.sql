-- Migration baseline — generated from database/schema_paymenthub.sql
-- This records the initial schema so `prisma migrate deploy` works on fresh databases.

CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `username`      VARCHAR(100) NOT NULL,
  `email`         VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name`     VARCHAR(255) NOT NULL,
  `role`          ENUM('Admin','Owner','Developer','Operations','PartnerManager') NOT NULL DEFAULT 'Operations',
  `status`        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `avatar_url`    VARCHAR(500),
  `last_login_at` DATETIME(0),
  `created_at`    DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `users_username_key` (`username`),
  UNIQUE INDEX `users_email_key` (`email`),
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `merchants` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `name`                VARCHAR(255) NOT NULL,
  `code`                VARCHAR(100) NOT NULL,
  `contact_name`        VARCHAR(255),
  `contact_email`       VARCHAR(255),
  `contact_phone`       VARCHAR(50),
  `status`              ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `default_webhook_url` VARCHAR(500),
  `webhook_secret`      VARCHAR(500),
  `ip_whitelist`        JSON,
  `monthly_limit`       DECIMAL(15,0),
  `created_at`          DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `merchants_code_key` (`code`),
  INDEX `idx_merchants_code` (`code`),
  INDEX `idx_merchants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_keys` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `merchant_id`  INT NOT NULL,
  `api_key`      VARCHAR(255) NOT NULL,
  `api_secret`   VARCHAR(255) NOT NULL,
  `name`         VARCHAR(200) NOT NULL,
  `status`       ENUM('Active','Revoked') NOT NULL DEFAULT 'Active',
  `rate_limit`   INT NOT NULL DEFAULT 100,
  `last_used_at` DATETIME(0),
  `expires_at`   DATETIME(0),
  `created_at`   DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `api_keys_api_key_key` (`api_key`),
  INDEX `idx_apikeys_key` (`api_key`),
  INDEX `idx_apikeys_merchant` (`merchant_id`),
  INDEX `idx_apikeys_status` (`status`),
  CONSTRAINT `fk_apikeys_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `partner_configs` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `connector_type`       VARCHAR(50) NOT NULL,
  `name`                 VARCHAR(255) NOT NULL,
  `api_key`              VARCHAR(500) NOT NULL,
  `secret_key`           VARCHAR(500) NOT NULL,
  `merchant_code`        VARCHAR(255),
  `endpoint_sandbox`     VARCHAR(500),
  `endpoint_production`  VARCHAR(500),
  `callback_url`         VARCHAR(500),
  `webhook_url`          VARCHAR(500),
  `timeout`              INT NOT NULL DEFAULT 30000,
  `retry_policy`         JSON,
  `status`               ENUM('Active','Inactive','Error') NOT NULL DEFAULT 'Inactive',
  `environment`          ENUM('Sandbox','Production') NOT NULL DEFAULT 'Sandbox',
  `test_result`          JSON,
  `last_tested_at`       DATETIME(0),
  `created_at`           DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_partner_type` (`connector_type`),
  INDEX `idx_partner_status` (`status`),
  INDEX `idx_partner_env` (`environment`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `partner_config_logs` (
  `id`               BIGINT AUTO_INCREMENT PRIMARY KEY,
  `partner_config_id` INT NOT NULL,
  `user_id`          INT,
  `field_changed`    VARCHAR(100) NOT NULL,
  `old_value`        TEXT,
  `new_value`        TEXT,
  `ip_address`       VARCHAR(45),
  `created_at`       DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_pcl_partner` (`partner_config_id`),
  CONSTRAINT `fk_pcl_partner` FOREIGN KEY (`partner_config_id`) REFERENCES `partner_configs`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pcl_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `connectors` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(255) NOT NULL,
  `code`          VARCHAR(50) NOT NULL,
  `version`       VARCHAR(50) NOT NULL,
  `description`   TEXT,
  `status`        ENUM('Installed','Not Installed','Error') NOT NULL DEFAULT 'Not Installed',
  `config_schema` JSON,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`    DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `connectors_code_key` (`code`),
  INDEX `idx_connectors_code` (`code`),
  INDEX `idx_connectors_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `txn_code`         VARCHAR(100) NOT NULL,
  `merchant_id`      INT NOT NULL,
  `merchant_txn_id`  VARCHAR(255),
  `api_key_id`       INT,
  `amount`           DECIMAL(15,0) NOT NULL,
  `refunded_amount`  DECIMAL(15,0) NOT NULL DEFAULT 0,
  `currency`         VARCHAR(10) NOT NULL DEFAULT 'VND',
  `description`      TEXT,
  `status`           ENUM('Created','Pending','Success','Failed','Expired','Refunded','PartiallyRefunded') NOT NULL DEFAULT 'Created',
  `payment_method`   VARCHAR(50),
  `partner_config_id` INT,
  `partner_txn_id`   VARCHAR(255),
  `return_url`       VARCHAR(500),
  `webhook_url`      VARCHAR(500),
  `customer_name`    VARCHAR(255),
  `customer_email`   VARCHAR(255),
  `customer_phone`   VARCHAR(50),
  `ip_address`       VARCHAR(45),
  `metadata`         JSON,
  `idempotency_key`  VARCHAR(255),
  `expired_at`       DATETIME(0),
  `paid_at`          DATETIME(0),
  `notify_webhook`   TINYINT(1) NOT NULL DEFAULT 0,
  `webhook_sent_at`  DATETIME(0),
  `created_at`       DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `transactions_txn_code_key` (`txn_code`),
  INDEX `idx_txn_code` (`txn_code`),
  INDEX `idx_txn_merchant` (`merchant_id`),
  INDEX `idx_txn_merchant_txn` (`merchant_id`, `merchant_txn_id`),
  INDEX `idx_txn_partner` (`partner_config_id`),
  INDEX `idx_txn_partner_txn` (`partner_txn_id`),
  INDEX `idx_txn_status` (`status`),
  INDEX `idx_txn_created` (`created_at`),
  INDEX `idx_txn_idempotency` (`idempotency_key`),
  INDEX `idx_txn_expired` (`expired_at`),
  CONSTRAINT `fk_txn_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_txn_apikey` FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_txn_partner` FOREIGN KEY (`partner_config_id`) REFERENCES `partner_configs`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transaction_logs` (
  `id`             BIGINT AUTO_INCREMENT PRIMARY KEY,
  `transaction_id` INT NOT NULL,
  `event`          VARCHAR(50) NOT NULL,
  `from_status`    VARCHAR(50),
  `to_status`      VARCHAR(50),
  `description`    TEXT,
  `raw_data`       JSON,
  `created_by`     VARCHAR(255),
  `created_at`     DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_txnlog_txn` (`transaction_id`),
  INDEX `idx_txnlog_event` (`event`),
  INDEX `idx_txnlog_created` (`created_at`),
  CONSTRAINT `fk_txnlog_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transaction_raw_data` (
  `id`             BIGINT AUTO_INCREMENT PRIMARY KEY,
  `transaction_id` INT NOT NULL,
  `direction`      ENUM('Request','Response') NOT NULL,
  `source`         ENUM('Partner','PaymentHub','Merchant') NOT NULL,
  `endpoint`       VARCHAR(500),
  `headers`        JSON,
  `body`           JSON,
  `http_status`    INT,
  `created_at`     DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_raw_txn` (`transaction_id`),
  INDEX `idx_raw_created` (`created_at`),
  CONSTRAINT `fk_raw_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `transaction_id`    INT NOT NULL,
  `refund_code`       VARCHAR(100) NOT NULL,
  `amount`            DECIMAL(15,0) NOT NULL,
  `reason`            TEXT NOT NULL,
  `status`            ENUM('Pending','Processing','Completed','Failed') NOT NULL DEFAULT 'Pending',
  `partner_refund_id` VARCHAR(255),
  `raw_request`       JSON,
  `raw_response`      JSON,
  `error_message`     TEXT,
  `processed_by`      INT,
  `processed_at`      DATETIME(0),
  `created_at`        DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `refunds_refund_code_key` (`refund_code`),
  INDEX `idx_refund_txn` (`transaction_id`),
  INDEX `idx_refund_code` (`refund_code`),
  INDEX `idx_refund_status` (`status`),
  CONSTRAINT `fk_refund_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refund_processor` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_configs` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `merchant_id`     INT NOT NULL,
  `url`             VARCHAR(500) NOT NULL,
  `secret`          VARCHAR(500) NOT NULL,
  `events`          JSON NOT NULL,
  `status`          ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `retry_count`     INT NOT NULL DEFAULT 5,
  `retry_intervals` JSON,
  `timeout_ms`      INT NOT NULL DEFAULT 30000,
  `created_at`      DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_whconf_merchant` (`merchant_id`),
  INDEX `idx_whconf_status` (`status`),
  CONSTRAINT `fk_whconf_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_logs` (
  `id`               BIGINT AUTO_INCREMENT PRIMARY KEY,
  `webhook_config_id` INT,
  `transaction_id`   INT,
  `event`            VARCHAR(50) NOT NULL,
  `request_url`      VARCHAR(500),
  `request_headers`  JSON,
  `request_body`     JSON,
  `response_status`  INT,
  `response_body`    TEXT,
  `response_headers` JSON,
  `status`           ENUM('Success','Failed') NOT NULL,
  `attempt`          INT NOT NULL DEFAULT 1,
  `max_retries`      INT NOT NULL DEFAULT 5,
  `next_retry_at`    DATETIME(0),
  `duration_ms`      INT,
  `error_message`    TEXT,
  `created_at`       DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_whlog_config` (`webhook_config_id`),
  INDEX `idx_whlog_txn` (`transaction_id`),
  INDEX `idx_whlog_event` (`event`),
  INDEX `idx_whlog_status` (`status`),
  INDEX `idx_whlog_created` (`created_at`),
  INDEX `idx_whlog_retry` (`next_retry_at`),
  CONSTRAINT `fk_whlog_config` FOREIGN KEY (`webhook_config_id`) REFERENCES `webhook_configs`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_whlog_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reconciliation_runs` (
  `id`                      INT AUTO_INCREMENT PRIMARY KEY,
  `run_date`                DATE NOT NULL,
  `partner_config_id`       INT NOT NULL,
  `status`                  ENUM('Running','Completed','Failed') NOT NULL DEFAULT 'Running',
  `total_paymenthub`        INT NOT NULL DEFAULT 0,
  `total_partner`           INT NOT NULL DEFAULT 0,
  `total_amount_paymenthub` DECIMAL(15,0) NOT NULL DEFAULT 0,
  `total_amount_partner`    DECIMAL(15,0) NOT NULL DEFAULT 0,
  `matched_count`           INT NOT NULL DEFAULT 0,
  `unmatched_paymenthub`    INT NOT NULL DEFAULT 0,
  `unmatched_partner`       INT NOT NULL DEFAULT 0,
  `amount_mismatch_count`   INT NOT NULL DEFAULT 0,
  `total_discrepancy`       DECIMAL(15,0) NOT NULL DEFAULT 0,
  `report_file`             VARCHAR(500),
  `notes`                   TEXT,
  `started_at`              DATETIME(0),
  `completed_at`            DATETIME(0),
  `created_at`              DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_recon_date` (`run_date`),
  INDEX `idx_recon_partner` (`partner_config_id`),
  INDEX `idx_recon_status` (`status`),
  CONSTRAINT `fk_recon_partner` FOREIGN KEY (`partner_config_id`) REFERENCES `partner_configs`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reconciliation_details` (
  `id`                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  `reconciliation_run_id` INT NOT NULL,
  `transaction_id`        INT,
  `partner_txn_id`        VARCHAR(255),
  `match_status`          ENUM('Matched','Unmatched_PaymentHub','Unmatched_Partner','Amount_Mismatch') NOT NULL,
  `paymenthub_amount`     DECIMAL(15,0),
  `partner_amount`        DECIMAL(15,0),
  `discrepancy_amount`    DECIMAL(15,0) NOT NULL DEFAULT 0,
  `partner_txn_date`      DATETIME(0),
  `status`                ENUM('Open','Resolved') NOT NULL DEFAULT 'Open',
  `resolution`            TEXT,
  `created_at`            DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_recondetail_run` (`reconciliation_run_id`),
  INDEX `idx_recondetail_txn` (`transaction_id`),
  INDEX `idx_recondetail_status` (`match_status`),
  CONSTRAINT `fk_recondetail_run` FOREIGN KEY (`reconciliation_run_id`) REFERENCES `reconciliation_runs`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recondetail_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `disputes` (
  `id`                    INT AUTO_INCREMENT PRIMARY KEY,
  `transaction_id`        INT NOT NULL,
  `dispute_code`          VARCHAR(100) NOT NULL,
  `reason`                TEXT NOT NULL,
  `description`           TEXT,
  `status`                ENUM('Pending','Processing','Resolved','Rejected') NOT NULL DEFAULT 'Pending',
  `resolution`            TEXT,
  `submitted_to_partner`  TINYINT(1) NOT NULL DEFAULT 0,
  `partner_response`      JSON,
  `created_by`            INT,
  `resolved_by`           INT,
  `resolved_at`           DATETIME(0),
  `created_at`            DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `disputes_dispute_code_key` (`dispute_code`),
  INDEX `idx_dispute_txn` (`transaction_id`),
  INDEX `idx_dispute_status` (`status`),
  CONSTRAINT `fk_dispute_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispute_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_dispute_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dispute_attachments` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `dispute_id`  INT NOT NULL,
  `file_name`   VARCHAR(255) NOT NULL,
  `file_path`   VARCHAR(500) NOT NULL,
  `file_type`   VARCHAR(50),
  `file_size`   INT,
  `uploaded_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_da_dispute` (`dispute_id`),
  CONSTRAINT `fk_da_dispute` FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`          BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT,
  `username`    VARCHAR(100),
  `action`      VARCHAR(50) NOT NULL,
  `entity_type` VARCHAR(50) NOT NULL,
  `entity_id`   VARCHAR(100),
  `old_data`    JSON,
  `new_data`    JSON,
  `ip_address`  VARCHAR(45),
  `user_agent`  VARCHAR(500),
  `description` TEXT,
  `created_at`  DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_entity` (`entity_type`, `entity_id`),
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`             BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id`        INT NOT NULL,
  `type`           ENUM('Success','Warning','Error','Info') NOT NULL DEFAULT 'Info',
  `title`          VARCHAR(255) NOT NULL,
  `message`        TEXT,
  `reference_type` VARCHAR(50),
  `reference_id`   VARCHAR(100),
  `channel`        ENUM('System','Email') NOT NULL DEFAULT 'System',
  `is_read`        TINYINT(1) NOT NULL DEFAULT 0,
  `read_at`        DATETIME(0),
  `created_at`     DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notif_user` (`user_id`),
  INDEX `idx_notif_read` (`user_id`, `is_read`),
  INDEX `idx_notif_created` (`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qr_codes` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `transaction_id` INT NOT NULL,
  `qr_type`        VARCHAR(50) NOT NULL,
  `raw_data`       TEXT,
  `image_base64`   LONGTEXT,
  `image_url`      VARCHAR(500),
  `size`           INT NOT NULL DEFAULT 300,
  `expires_at`     DATETIME(0),
  `is_expired`     TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`     DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_qr_txn` (`transaction_id`),
  INDEX `idx_qr_expires` (`expires_at`),
  CONSTRAINT `fk_qr_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `id`         BIGINT AUTO_INCREMENT PRIMARY KEY,
  `key_value`  VARCHAR(255) NOT NULL,
  `response`   JSON,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `idempotency_keys_key_value_key` (`key_value`),
  INDEX `idx_idemp_key` (`key_value`),
  INDEX `idx_idemp_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
