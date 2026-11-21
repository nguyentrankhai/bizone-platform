-- Backup / restore-test journal (P7.5). Written by scripts/backup.sh and scripts/backup-verify.sh
-- through the mariadb client (one row per run); read by the health check (age of the last
-- successful backup) and the DR runbook. Not append-only: rows older than the backup retention
-- are pruned by backup.sh together with the backup sets.
CREATE TABLE `backup_runs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `kind` VARCHAR(20) NOT NULL,              -- backup | verify | restore
  `status` VARCHAR(20) NOT NULL,            -- success | failed
  `backup_name` VARCHAR(100) NULL,          -- payhub-YYYYmmdd-HHMMSS
  `started_at` DATETIME(0) NOT NULL,
  `finished_at` DATETIME(0) NOT NULL,
  `duration_s` INT NOT NULL DEFAULT 0,
  `size_bytes` BIGINT NULL,
  `host` VARCHAR(100) NULL,
  `details` JSON NULL,
  `error` VARCHAR(1000) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_backup_kind_status` (`kind`, `status`, `finished_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
