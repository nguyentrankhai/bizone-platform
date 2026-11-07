-- QA-2 #42: merchant_txn_id is unique per merchant (SRS-PaymentHub §merchant_txn_id,
-- API-Design §5.1 → 409 CONFLICT). NULLs stay allowed for internally created rows.
-- Fails if duplicates already exist — resolve them before deploying.
DROP INDEX `idx_txn_merchant_txn` ON `transactions`;
CREATE UNIQUE INDEX `uq_txn_merchant_txn` ON `transactions`(`merchant_id`, `merchant_txn_id`);
