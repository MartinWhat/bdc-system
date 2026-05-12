-- Add fixedPhone to sys_user for user management

ALTER TABLE `sys_user`
  ADD COLUMN `fixedPhone` VARCHAR(191) NULL AFTER `phone`;

CREATE INDEX `sys_user_fixedPhone_idx`
  ON `sys_user`(`fixedPhone`);
