-- =============================================================================================
-- P7.4 — Partitioning & archiving of Payment Hub transactions (MariaDB 10.11)
--
--   mysql -h127.0.0.1 -uroot -p paymentdb < scripts/partition-transactions.sql
--
-- Safe to re-run: only reads metadata, creates what is missing and (re)defines one procedure.
-- The archive table itself is created by Prisma migration 12_transaction_archive; the worker
-- (maintenance task "archive", server/services/archive.service.ts) fills it every night and adds
-- month partitions on demand. This script is the DBA side: checks, manual partition maintenance.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. Why `transactions` itself is NOT partitioned
-- ---------------------------------------------------------------------------------------------
-- MariaDB rules for a partitioned table:
--   a) every UNIQUE key (PRIMARY KEY included) must contain all partitioning columns;
--   b) an InnoDB partitioned table can neither have nor be the target of a FOREIGN KEY.
-- Partitioning `transactions` by month of created_at would therefore require
--   PRIMARY KEY (id, created_at), UNIQUE (txn_code, created_at),
--   UNIQUE (merchant_id, merchant_txn_id, created_at)
-- i.e. a txn_code / merchant_txn_id would only be unique *within a month* (idempotency of
-- `POST /api/v1/transactions` relies on the global unique key, QA-2), and dropping the 7 FKs
-- below (cascades used by refunds, disputes, logs…; append-only journal of P7.2).
--
-- The two queries show what blocks it on the current schema:

SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_key
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND NON_UNIQUE = 0
GROUP BY INDEX_NAME;

SELECT TABLE_NAME AS child_table, CONSTRAINT_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'transactions'
ORDER BY TABLE_NAME;

-- Trying it fails (kept commented — do not run on a real database):
--   ALTER TABLE transactions PARTITION BY RANGE COLUMNS (created_at) (
--     PARTITION p202611 VALUES LESS THAN ('2026-12-01'), PARTITION p_max VALUES LESS THAN (MAXVALUE));
--   → ERROR 1503: A PRIMARY KEY must include all columns in the table's partitioning function
--   → (after changing the PK) ERROR 1506: Foreign keys are not yet supported in conjunction with partitioning
--
-- Chosen instead (decision P7.4): hot table + partitioned archive.
--   * `transactions` keeps only recent / open transactions (indexes on created_at, paid_at,
--     status… stay small) with every constraint intact.
--   * Final transactions older than TXN_ARCHIVE_MONTHS (default 24 — reports read ≤ 366 days and
--     compare with the same period a year before) move to `transactions_archive`, partitioned by
--     month of created_at; their logs / raw data / refunds / disputes / QR codes / webhook
--     deliveries are folded into the `history` JSON column and the hot rows are deleted (children
--     by FK cascade). Reads by id / txn_code / merchant_txn_id fall back to the archive.
--   * Expiring old data = DROP PARTITION (instant, no row-by-row DELETE) when
--     TXN_ARCHIVE_RETENTION_MONTHS > 0 (default 0 = keep: accounting records are kept 10 years).


-- ---------------------------------------------------------------------------------------------
-- 2. Archive table (same definition as migration 12 — created here only if missing)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions_archive` (
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


-- ---------------------------------------------------------------------------------------------
-- 3. Month partitions — payhub_archive_ensure_months(until): split p_max so that every month up
--    to `until` has its own partition `pYYYYMM` (the worker does the same before each batch).
-- ---------------------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS payhub_archive_ensure_months;
DELIMITER //
CREATE PROCEDURE payhub_archive_ensure_months(IN p_until DATE)
BEGIN
  DECLARE v_last DATE;
  DECLARE v_month DATE;
  DECLARE v_defs TEXT DEFAULT '';

  -- highest finite upper bound = first month without its own partition
  SELECT MAX(STR_TO_DATE(REPLACE(PARTITION_DESCRIPTION, '''', ''), '%Y-%m-%d %H:%i:%s'))
    INTO v_last
  FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions_archive'
    AND PARTITION_DESCRIPTION <> 'MAXVALUE';

  SET v_month = v_last;
  WHILE v_month <= DATE_FORMAT(p_until, '%Y-%m-01') DO
    SET v_defs = CONCAT(v_defs,
      'PARTITION `p', DATE_FORMAT(v_month, '%Y%m'), '` VALUES LESS THAN (''',
      DATE_FORMAT(DATE_ADD(v_month, INTERVAL 1 MONTH), '%Y-%m-%d 00:00:00'), '''), ');
    SET v_month = DATE_ADD(v_month, INTERVAL 1 MONTH);
  END WHILE;

  IF v_defs <> '' THEN
    SET @ddl = CONCAT('ALTER TABLE `transactions_archive` REORGANIZE PARTITION `p_max` INTO (',
                      v_defs, 'PARTITION `p_max` VALUES LESS THAN (MAXVALUE))');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- e.g. pre-create partitions for every month up to the archive cutoff (today − 24 months):
CALL payhub_archive_ensure_months(DATE_SUB(CURDATE(), INTERVAL 24 MONTH));


-- ---------------------------------------------------------------------------------------------
-- 4. Inspection
-- ---------------------------------------------------------------------------------------------
-- Rows / size per partition
SELECT PARTITION_NAME, PARTITION_DESCRIPTION AS less_than, TABLE_ROWS,
       ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb
FROM information_schema.PARTITIONS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions_archive'
ORDER BY PARTITION_ORDINAL_POSITION;

-- Hot table: how many transactions are old enough to be archived (same rule as the worker,
-- without the refund / dispute / outbox checks)
SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS transactions
FROM transactions
WHERE created_at < DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 24 MONTH), '%Y-%m-01')
  AND status IN ('Success', 'Failed', 'Expired', 'Refunded', 'PartiallyRefunded')
GROUP BY month ORDER BY month;

-- Partition pruning check: only the partitions of the asked month are read
EXPLAIN PARTITIONS
SELECT COUNT(*) FROM transactions_archive
WHERE created_at >= '2024-03-01' AND created_at < '2024-04-01';


-- ---------------------------------------------------------------------------------------------
-- 5. Retention (manual — the worker does it when TXN_ARCHIVE_RETENTION_MONTHS > 0)
-- ---------------------------------------------------------------------------------------------
-- Drop a whole month instantly (no row-by-row DELETE, no undo log):
--   ALTER TABLE transactions_archive DROP PARTITION p202401;
-- Empty the catch-all of months before the first partition (never drop p_old):
--   ALTER TABLE transactions_archive TRUNCATE PARTITION p_old;
-- Move a month to cold storage first (table with the same columns, not partitioned, no FKs):
--   CREATE TABLE transactions_archive_202401 LIKE transactions_archive;
--   ALTER TABLE transactions_archive_202401 REMOVE PARTITIONING;
--   ALTER TABLE transactions_archive EXCHANGE PARTITION p202401 WITH TABLE transactions_archive_202401;
--   → dump transactions_archive_202401 (mysqldump) and drop it.
