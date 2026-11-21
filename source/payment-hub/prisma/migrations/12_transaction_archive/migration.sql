-- P7.4: archive for old transactions, partitioned by month.
--
-- `transactions` itself is NOT partitioned: MariaDB requires the partitioning column in every
-- unique key (PRIMARY KEY id, UNIQUE txn_code, UNIQUE (merchant_id, merchant_txn_id)) and InnoDB
-- partitioned tables support no foreign keys — 7 tables reference `transactions` (logs, raw data,
-- refunds, QR codes, webhook logs, disputes, reconciliation details). Partitioning the hot table
-- would drop global uniqueness of txn_code / merchant_txn_id and all 7 FKs. Instead the worker moves
-- final transactions older than TXN_ARCHIVE_MONTHS (default 24) into this table, child rows folded
-- into `history` (JSON), and deletes them from `transactions` (children go by FK cascade). Old
-- months can then be dropped as whole partitions. Details: scripts/partition-transactions.sql.
--
-- Partitions: p_old (< 2025-01) + one per month created on demand by the archive job
-- (REORGANIZE p_max) + p_max (MAXVALUE). Month = created_at (UTC, like the column).
CREATE TABLE `transactions_archive` (
  `id` INT NOT NULL,
  `txn_code` VARCHAR(100) NOT NULL,
  `merchant_id` INT NOT NULL,
  `merchant_txn_id` VARCHAR(255) NULL,
  `api_key_id` INT NULL,
  `amount` DECIMAL(15,0) NOT NULL,
  `refunded_amount` DECIMAL(15,0) NOT NULL DEFAULT 0,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'VND',
  `description` TEXT NULL,
  `status` VARCHAR(20) NOT NULL,
  `payment_method` VARCHAR(50) NULL,
  `partner_config_id` INT NULL,
  `partner_txn_id` VARCHAR(255) NULL,
  `return_url` VARCHAR(500) NULL,
  `webhook_url` VARCHAR(500) NULL,
  `customer_name` VARCHAR(255) NULL,
  `customer_email` VARCHAR(255) NULL,
  `customer_phone` VARCHAR(50) NULL,
  `ip_address` VARCHAR(45) NULL,
  `metadata` JSON NULL,
  `idempotency_key` VARCHAR(255) NULL,
  `expired_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `archived_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `history` JSON NOT NULL,
  PRIMARY KEY (`id`, `created_at`),
  KEY `idx_txna_code` (`txn_code`),
  KEY `idx_txna_merchant_txn` (`merchant_id`, `merchant_txn_id`),
  KEY `idx_txna_merchant_created` (`merchant_id`, `created_at`),
  KEY `idx_txna_partner_txn` (`partner_txn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE COLUMNS (`created_at`) (
  PARTITION `p_old` VALUES LESS THAN ('2025-01-01 00:00:00'),
  PARTITION `p_max` VALUES LESS THAN (MAXVALUE)
);
