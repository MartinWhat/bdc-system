-- 数据库结构优化：
-- 1. 为高频筛选 + 排序路径补充联合索引
-- 2. 为关键业务字段补充唯一约束，避免并发写入造成脏数据

-- === SysUser ===
CREATE INDEX `sys_user_status_createdAt_idx`
  ON `sys_user`(`status`, `createdAt`);

-- === SysTown ===
CREATE INDEX `sys_town_status_sortOrder_createdAt_idx`
  ON `sys_town`(`status`, `sortOrder`, `createdAt`);

-- === SysVillage ===
CREATE INDEX `sys_village_status_sortOrder_createdAt_idx`
  ON `sys_village`(`status`, `sortOrder`, `createdAt`);

CREATE INDEX `sys_village_townId_status_sortOrder_createdAt_idx`
  ON `sys_village`(`townId`, `status`, `sortOrder`, `createdAt`);

-- === ZjdBdc ===
CREATE INDEX `zjd_bdc_status_createdAt_idx`
  ON `zjd_bdc`(`status`, `createdAt`);

CREATE INDEX `zjd_bdc_villageId_status_createdAt_idx`
  ON `zjd_bdc`(`villageId`, `status`, `createdAt`);

CREATE INDEX `zjd_bdc_acceptDate_idx`
  ON `zjd_bdc`(`acceptDate`);

CREATE INDEX `zjd_bdc_status_certIssuedDate_idx`
  ON `zjd_bdc`(`status`, `certIssuedDate`);

-- === ZjdReceiveRecord ===
CREATE INDEX `zjd_receive_record_bdcId_status_idx`
  ON `zjd_receive_record`(`bdcId`, `status`);

CREATE INDEX `zjd_receive_record_status_createdAt_idx`
  ON `zjd_receive_record`(`status`, `createdAt`);

-- === ProcessNode ===
CREATE INDEX `zjd_process_node_receiveRecordId_createdAt_idx`
  ON `zjd_process_node`(`receiveRecordId`, `createdAt`);

-- === Objection ===
CREATE INDEX `zjd_objection_receiveRecordId_status_createdAt_idx`
  ON `zjd_objection`(`receiveRecordId`, `status`, `createdAt`);

CREATE INDEX `zjd_objection_status_createdAt_idx`
  ON `zjd_objection`(`status`, `createdAt`);

CREATE INDEX `zjd_objection_currentWorkflowId_idx`
  ON `zjd_objection`(`currentWorkflowId`);

-- === ObjectionWorkflow ===
CREATE INDEX `objection_workflow_isActive_createdAt_idx`
  ON `objection_workflow`(`isActive`, `createdAt`);

-- === ObjectionWorkflowStep ===
ALTER TABLE `objection_workflow_step`
  ADD CONSTRAINT `objection_workflow_step_workflowId_stepOrder_key`
  UNIQUE (`workflowId`, `stepOrder`);

-- === ObjectionTask ===
CREATE INDEX `objection_task_objectionId_stepOrder_idx`
  ON `objection_task`(`objectionId`, `stepOrder`);

-- === OperationLog ===
CREATE INDEX `sys_operation_log_userId_createdAt_idx`
  ON `sys_operation_log`(`userId`, `createdAt`);

CREATE INDEX `sys_operation_log_module_createdAt_idx`
  ON `sys_operation_log`(`module`, `createdAt`);

CREATE INDEX `sys_operation_log_status_createdAt_idx`
  ON `sys_operation_log`(`status`, `createdAt`);

-- === CollectiveCert ===
CREATE INDEX `collective_cert_status_createdAt_idx`
  ON `collective_cert`(`status`, `createdAt`);

CREATE INDEX `collective_cert_villageId_status_createdAt_idx`
  ON `collective_cert`(`villageId`, `status`, `createdAt`);

CREATE INDEX `collective_cert_ownerType_createdAt_idx`
  ON `collective_cert`(`ownerType`, `createdAt`);

-- === Notification ===
CREATE INDEX `notification_status_isPinned_publishedAt_idx`
  ON `notification`(`status`, `isPinned`, `publishedAt`);

CREATE INDEX `notification_status_isPopup_popupStartAt_popupEndAt_publishedAt_idx`
  ON `notification`(`status`, `isPopup`, `popupStartAt`, `popupEndAt`, `publishedAt`);

-- === Attachment ===
CREATE INDEX `attachment_fileType_createdAt_idx`
  ON `attachment`(`fileType`, `createdAt`);

CREATE INDEX `attachment_uploadedBy_createdAt_idx`
  ON `attachment`(`uploadedBy`, `createdAt`);
