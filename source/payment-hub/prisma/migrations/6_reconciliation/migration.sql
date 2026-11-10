-- P5.4: reconciliation engine.
--  runs: where the partner side came from (status queries per transaction or an imported
--    statement file), who started it, transactions the partner could not be asked about, errors
--  details: identifiers + both statuses so a row is readable without joins (partner-only rows have
--    no transaction), why it is a discrepancy, who resolved it; match_status gains `Unverified`
--    (status query failed — neither matched nor a discrepancy)
ALTER TABLE `reconciliation_runs`
  ADD COLUMN `source` ENUM('Api','File') NOT NULL DEFAULT 'Api' AFTER `status`,
  ADD COLUMN `source_file` VARCHAR(255) NULL AFTER `source`,
  ADD COLUMN `unverified_count` INT NOT NULL DEFAULT 0 AFTER `amount_mismatch_count`,
  ADD COLUMN `error_message` TEXT NULL AFTER `notes`,
  ADD COLUMN `triggered_by` VARCHAR(100) NULL AFTER `error_message`;

ALTER TABLE `reconciliation_details`
  MODIFY `match_status` ENUM('Matched','Unmatched_PaymentHub','Unmatched_Partner','Amount_Mismatch','Unverified') NOT NULL,
  ADD COLUMN `txn_code` VARCHAR(100) NULL AFTER `transaction_id`,
  ADD COLUMN `partner_ref` VARCHAR(255) NULL AFTER `partner_txn_id`,
  ADD COLUMN `paymenthub_status` VARCHAR(30) NULL AFTER `partner_txn_date`,
  ADD COLUMN `partner_status` VARCHAR(50) NULL AFTER `paymenthub_status`,
  ADD COLUMN `note` VARCHAR(500) NULL AFTER `partner_status`,
  ADD COLUMN `resolved_by` VARCHAR(100) NULL AFTER `resolution`,
  ADD COLUMN `resolved_at` DATETIME NULL AFTER `resolved_by`;

CREATE INDEX `idx_recondetail_run_match` ON `reconciliation_details`(`reconciliation_run_id`, `match_status`);
CREATE INDEX `idx_recon_partner_date` ON `reconciliation_runs`(`partner_config_id`, `run_date`);
