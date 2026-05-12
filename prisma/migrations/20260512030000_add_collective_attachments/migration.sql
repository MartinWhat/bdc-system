-- Add certificate binding metadata to attachments
ALTER TABLE `attachment`
  ADD COLUMN `collectiveCertId` VARCHAR(191) NULL,
  ADD COLUMN `bdcId` VARCHAR(191) NULL,
  ADD COLUMN `certificateFamily` VARCHAR(191) NULL,
  ADD COLUMN `pageType` VARCHAR(191) NULL,
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `processed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mimeType` VARCHAR(191) NULL;

CREATE INDEX `attachment_collectiveCertId_idx` ON `attachment`(`collectiveCertId`);
CREATE INDEX `attachment_bdcId_idx` ON `attachment`(`bdcId`);
CREATE INDEX `attachment_certificateFamily_idx` ON `attachment`(`certificateFamily`);
CREATE INDEX `attachment_pageType_idx` ON `attachment`(`pageType`);

ALTER TABLE `attachment`
  ADD CONSTRAINT `attachment_collectiveCertId_fkey`
  FOREIGN KEY (`collectiveCertId`) REFERENCES `collective_cert`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `attachment`
  ADD CONSTRAINT `attachment_bdcId_fkey`
  FOREIGN KEY (`bdcId`) REFERENCES `zjd_bdc`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
