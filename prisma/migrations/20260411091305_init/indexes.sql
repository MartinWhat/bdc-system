-- 数据库索引优化脚本
-- 用于提升查询性能的索引创建

-- 1. 用户表索引
CREATE INDEX IF NOT EXISTS idx_sys_user_username ON sys_user(username);
CREATE INDEX IF NOT EXISTS idx_sys_user_id_card_hash ON sys_user(id_card_hash);
CREATE INDEX IF NOT EXISTS idx_sys_user_phone_hash ON sys_user(phone_hash);
CREATE INDEX IF NOT EXISTS idx_sys_user_status ON sys_user(status);

-- 2. 角色关联表索引
CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON user_role(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON user_role(role_id);

-- 3. 权限关联表索引
CREATE INDEX IF NOT EXISTS idx_role_permission_role_id ON role_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permission_permission_id ON role_permission(permission_id);

-- 4. 会话表索引
CREATE INDEX IF NOT EXISTS idx_sys_session_user_id ON sys_session(user_id);
CREATE INDEX IF NOT EXISTS idx_sys_session_token ON sys_session(token);
CREATE INDEX IF NOT EXISTS idx_sys_session_expires_at ON sys_session(expires_at);

-- 5. 镇街表索引
CREATE INDEX IF NOT EXISTS idx_sys_town_code ON sys_town(code);
CREATE INDEX IF NOT EXISTS idx_sys_town_status ON sys_town(status);

-- 6. 村居表索引
CREATE INDEX IF NOT EXISTS idx_sys_village_code ON sys_village(code);
CREATE INDEX IF NOT EXISTS idx_sys_village_town_id ON sys_village(town_id);
CREATE INDEX IF NOT EXISTS idx_sys_village_status ON sys_village(status);

-- 7. 宅基地表索引（重要）
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_cert_no ON zjd_bdc(cert_no);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_village_id ON zjd_bdc(village_id);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_id_card_hash ON zjd_bdc(id_card_hash);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_phone_hash ON zjd_bdc(phone_hash);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_status ON zjd_bdc(status);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_created_by ON zjd_bdc(created_by);
CREATE INDEX IF NOT EXISTS idx_zjd_bdc_created_at ON zjd_bdc(created_at);

-- 8. 操作日志表索引
CREATE INDEX IF NOT EXISTS idx_operation_log_user_id ON operation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_bdc_id ON operation_log(bdc_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_module ON operation_log(module);
CREATE INDEX IF NOT EXISTS idx_operation_log_action ON operation_log(action);
CREATE INDEX IF NOT EXISTS idx_operation_log_status ON operation_log(status);
CREATE INDEX IF NOT EXISTS idx_operation_log_created_at ON operation_log(created_at);

-- 9. 密钥版本表索引
CREATE INDEX IF NOT EXISTS idx_key_version_type ON sys_key_version(key_type);
CREATE INDEX IF NOT EXISTS idx_key_version_is_active ON sys_key_version(is_active);
CREATE INDEX IF NOT EXISTS idx_key_version_expires_at ON sys_key_version(expires_at);

-- 10. 领证记录表索引
CREATE INDEX IF NOT EXISTS idx_receive_record_bdc_id ON zjd_receive_record(bdc_id);
CREATE INDEX IF NOT EXISTS idx_receive_record_applicant_id ON zjd_receive_record(applicant_id);
CREATE INDEX IF NOT EXISTS idx_receive_record_status ON zjd_receive_record(status);
CREATE INDEX IF NOT EXISTS idx_receive_record_apply_date ON zjd_receive_record(apply_date);

-- 查看索引使用情况（SQLite）
-- SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';
