-- P5.5: reports.
--  partner_configs: fee schedule of the partner contract (percent of the amount + fixed amount per
--    successful transaction) — reports estimate transaction fees from it (SRS-PH-RPT-01-02, 02-05)
--  transactions: revenue reports group paid transactions by payment time
ALTER TABLE `partner_configs`
  ADD COLUMN `fee_percent` DECIMAL(6,4) NOT NULL DEFAULT 0 AFTER `retry_policy`,
  ADD COLUMN `fee_fixed` DECIMAL(15,0) NOT NULL DEFAULT 0 AFTER `fee_percent`;

CREATE INDEX `idx_txn_paid` ON `transactions`(`paid_at`);
