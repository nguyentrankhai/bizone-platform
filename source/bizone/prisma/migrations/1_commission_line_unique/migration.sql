-- P4.1: one commission line per (seller, invoice, rule) — recalculation is idempotent
CREATE UNIQUE INDEX `uq_commission_line` ON `commissions`(`user_id`, `invoice_id`, `commission_rule_id`);
