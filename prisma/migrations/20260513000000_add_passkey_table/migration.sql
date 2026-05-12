-- Add Better Auth passkey table

CREATE TABLE `passkey` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `publicKey` LONGTEXT NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `credentialID` VARCHAR(191) NOT NULL,
  `counter` INT NOT NULL,
  `deviceType` VARCHAR(191) NOT NULL,
  `backedUp` BOOLEAN NOT NULL,
  `transports` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `aaguid` VARCHAR(191) NULL,

  INDEX `passkey_userId_idx`(`userId`),
  INDEX `passkey_credentialID_idx`(`credentialID`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `passkey`
  ADD CONSTRAINT `passkey_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
