-- 去国密后的数据库整理：
-- 1. 删除不再使用的哈希字段
-- 2. 为明文精确查询补充索引
-- 3. 移除已废弃的 KMS 菜单权限数据

-- === 移除废弃权限 ===
DELETE FROM `sys_role_permission`
WHERE `permissionId` IN (
  SELECT `id` FROM `sys_permission` WHERE `code` = 'kms:manage'
);

DELETE FROM `sys_permission`
WHERE `code` = 'kms:manage';

-- === 移除废弃 KMS 表 ===
DROP TABLE `sys_key_version`;

-- === SysUser ===
ALTER TABLE `sys_user`
  DROP COLUMN `idCardHash`,
  DROP COLUMN `phoneHash`;

CREATE INDEX `sys_user_idCard_idx`
  ON `sys_user`(`idCard`);

CREATE INDEX `sys_user_phone_idx`
  ON `sys_user`(`phone`);

-- === ZjdBdc ===
ALTER TABLE `zjd_bdc`
  DROP COLUMN `idCardHash`,
  DROP COLUMN `phoneHash`;

CREATE INDEX `zjd_bdc_idCard_idx`
  ON `zjd_bdc`(`idCard`);

CREATE INDEX `zjd_bdc_phone_idx`
  ON `zjd_bdc`(`phone`);

-- === ZjdReceiveRecord ===
ALTER TABLE `zjd_receive_record`
  DROP COLUMN `receiverIdCardHash`,
  DROP COLUMN `receiverPhoneHash`;

-- === CollectiveCert ===
ALTER TABLE `collective_cert`
  DROP COLUMN `idCardHash`,
  DROP COLUMN `phoneHash`;

CREATE INDEX `collective_cert_idCard_idx`
  ON `collective_cert`(`idCard`);

CREATE INDEX `collective_cert_phone_idx`
  ON `collective_cert`(`phone`);
