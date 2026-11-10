-- P4.8: accounting — cash/bank funds, receipts & payments (phiếu thu / chi), fund ledger

-- Funds: cash drawer / safe or a bank account
ALTER TABLE `cash_funds`
    ADD COLUMN `type` ENUM('cash', 'bank') NOT NULL DEFAULT 'cash' AFTER `code`,
    ADD COLUMN `account_no` VARCHAR(50) NULL AFTER `type`,
    ADD COLUMN `description` TEXT NULL AFTER `account_no`;

-- Fund movements are append-only: corrections post a reversing movement
CREATE INDEX `idx_ft_reference` ON `fund_transactions`(`reference_type`, `reference_id`);

-- Records: explicit direction (a category of type 'both' is ambiguous), document code,
-- payer / receiver, cancellation instead of deletion (the fund movement is reversed)
ALTER TABLE `revenue_expense_records`
    ADD COLUMN `code` VARCHAR(30) NULL AFTER `id`,
    ADD COLUMN `type` ENUM('revenue', 'expense') NOT NULL DEFAULT 'expense' AFTER `code`,
    ADD COLUMN `partner_name` VARCHAR(255) NULL AFTER `description`,
    ADD COLUMN `status` ENUM('active', 'cancelled') NOT NULL DEFAULT 'active' AFTER `reference_id`,
    ADD COLUMN `cancel_reason` VARCHAR(500) NULL AFTER `status`,
    ADD COLUMN `cancelled_at` DATETIME(0) NULL AFTER `cancel_reason`,
    ADD COLUMN `cancelled_by` INTEGER NULL AFTER `cancelled_at`,
    ADD COLUMN `updated_by` INTEGER NULL AFTER `created_by`,
    ADD COLUMN `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) AFTER `created_at`;

UPDATE `revenue_expense_records` r
    JOIN `revenue_expense_categories` c ON c.id = r.category_id
    SET r.`type` = IF(c.`type` = 'expense', 'expense', 'revenue');

UPDATE `revenue_expense_records`
    SET `code` = CONCAT(IF(`type` = 'revenue', 'PT', 'PC'), LPAD(`id`, 6, '0'))
    WHERE `code` IS NULL;

CREATE UNIQUE INDEX `uq_rer_code` ON `revenue_expense_records`(`code`);
CREATE INDEX `idx_rer_type_date` ON `revenue_expense_records`(`type`, `date`);
CREATE INDEX `idx_rer_reference` ON `revenue_expense_records`(`reference_type`, `reference_id`);

ALTER TABLE `revenue_expense_records` ADD CONSTRAINT `fk_rer_cancelled` FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `revenue_expense_records` ADD CONSTRAINT `fk_rer_updated` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
