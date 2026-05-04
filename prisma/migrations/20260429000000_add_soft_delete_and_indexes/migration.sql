-- 6.1 软删除：为核心业务表添加 deletedAt 字段
-- 6.2 索引：为高频查询字段添加索引
-- 6.3 JSON 类型：将 attachments 从 String 改为 JSON

-- === ZjdBdc 表 ===
-- 添加软删除字段
ALTER TABLE `zjd_bdc` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- 添加索引
CREATE INDEX `zjd_bdc_deletedAt_index` ON `zjd_bdc`(`deletedAt`);
CREATE INDEX `zjd_bdc_ownerName_index` ON `zjd_bdc`(`ownerName`);

-- === ZjdReceiveRecord 表 ===
-- 添加软删除字段
ALTER TABLE `zjd_receive_record` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- 添加索引
CREATE INDEX `zjd_receive_record_deletedAt_index` ON `zjd_receive_record`(`deletedAt`);

-- === Objection 表 ===
-- 添加软删除字段
ALTER TABLE `zjd_objection` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- 添加索引
CREATE INDEX `zjd_objection_deletedAt_index` ON `zjd_objection`(`deletedAt`);

-- === CollectiveCert 表 ===
-- 添加软删除字段
ALTER TABLE `collective_cert` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- 修改 attachments 字段类型为 JSON
-- 注意：MariaDB 10.2+ 支持 JSON 类型，如果已有数据需要先检查格式
ALTER TABLE `collective_cert` MODIFY COLUMN `attachments` JSON NULL;

-- 添加索引
CREATE INDEX `collective_cert_deletedAt_index` ON `collective_cert`(`deletedAt`);
CREATE INDEX `collective_cert_ownerName_index` ON `collective_cert`(`ownerName`);

-- === OperationLog 表 ===
-- 添加索引（高频查询和统计字段）
CREATE INDEX `sys_operation_log_action_index` ON `sys_operation_log`(`action`);
CREATE INDEX `sys_operation_log_createdAt_index` ON `sys_operation_log`(`createdAt`);

-- === Notification 表 ===
-- 添加软删除字段
ALTER TABLE `notification` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- 添加索引
CREATE INDEX `notification_deletedAt_index` ON `notification`(`deletedAt`);