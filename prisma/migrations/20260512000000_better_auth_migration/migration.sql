-- Better Auth migration: extend sys_user and add auth tables

ALTER TABLE `sys_user`
  ADD COLUMN `displayUsername` VARCHAR(191) NULL AFTER `username`,
  ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT FALSE AFTER `avatar`;

ALTER TABLE `sys_user`
  MODIFY COLUMN `passwordHash` VARCHAR(191) NOT NULL DEFAULT '',
  MODIFY COLUMN `createdBy` VARCHAR(191) NULL DEFAULT 'system';

UPDATE `sys_user`
SET `displayUsername` = COALESCE(`displayUsername`, `realName`)
WHERE `displayUsername` IS NULL OR `displayUsername` = '';

UPDATE `sys_user`
SET `email` = CONCAT(`username`, '@system.local')
WHERE `email` IS NULL OR `email` = '';

CREATE TABLE `auth_account` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `providerId` VARCHAR(191) NOT NULL,
  `password` LONGTEXT NULL,
  `accessToken` LONGTEXT NULL,
  `refreshToken` LONGTEXT NULL,
  `idToken` LONGTEXT NULL,
  `accessTokenExpiresAt` DATETIME(3) NULL,
  `refreshTokenExpiresAt` DATETIME(3) NULL,
  `scope` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `auth_account_providerId_accountId_key`(`providerId`, `accountId`),
  INDEX `auth_account_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_session` (
  `id` VARCHAR(191) NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `auth_session_token_key`(`token`),
  INDEX `auth_session_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_verification` (
  `id` VARCHAR(191) NOT NULL,
  `identifier` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `auth_verification_identifier_idx`(`identifier`),
  INDEX `auth_verification_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `auth_account`
  ADD CONSTRAINT `auth_account_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `auth_session`
  ADD CONSTRAINT `auth_session_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
