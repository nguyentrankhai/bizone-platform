-- Hot-table indexes (P7.4, load test): every insert maintained two redundant indexes —
-- idx_txn_code duplicates the UNIQUE key on txn_code, idx_txn_idempotency is never queried
-- (idempotency lives in Redis) — and the merchant transaction list (WHERE merchant_id ORDER BY
-- created_at DESC) had no covering index. idx_txn_merchant_created also serves fk_txn_merchant.
ALTER TABLE `transactions`
  ADD INDEX `idx_txn_merchant_created` (`merchant_id`, `created_at`),
  DROP INDEX `idx_txn_merchant`,
  DROP INDEX `idx_txn_code`,
  DROP INDEX `idx_txn_idempotency`;
