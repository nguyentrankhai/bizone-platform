-- P4.6: per-branch configuration overriding store_config
-- CreateTable
CREATE TABLE `branch_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `config_key` VARCHAR(100) NOT NULL,
    `config_value` TEXT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_bc_branch_key`(`branch_id`, `config_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `branch_configs` ADD CONSTRAINT `fk_bc_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

