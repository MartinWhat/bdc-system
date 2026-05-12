-- Add Better Auth two-factor table

CREATE TABLE `two_factor` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `secret` VARCHAR(191) NOT NULL,
  `backupCodes` LONGTEXT NOT NULL,
  `verified` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `two_factor_userId_key`(`userId`),
  INDEX `two_factor_secret_idx`(`secret`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `two_factor`
  ADD CONSTRAINT `two_factor_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
