# 密钥轮换指南

**创建日期**: 2026-04-28  
**优先级**: P0 - 紧急

---

## 已完成项 ✅

- [x] 从版本控制移除 `.env`（确认未被 Git 追踪）
- [x] 更换 `JWT_SECRET_KEY`（新密钥已生效）
- [x] 更换 `COOKIE_ENCRYPTION_KEY`（新密钥已生效）

## 待处理项 ⚠️

### KMS_FALLBACK_KEY 轮换（需数据库迁移）

**当前状态**: 仍使用旧密钥 `0123456789abcdef0123456789abcdef`

**为什么需要小心**:

- `KMS_FALLBACK_KEY` 用于加密数据库中存储的 SM4_DATA 密钥
- 直接更换会导致所有已加密数据（身份证号、手机号）无法解密

**轮换步骤**:

#### 1. 备份数据库

```bash
mysqldump -h 10.0.0.13 -u bdc -p bdc > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### 2. 生成新密钥

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

#### 3. 执行数据迁移脚本

```bash
# 在 zjd/ 目录下执行
npx ts-node scripts/rotate-kms-fallback-key.ts <新密钥>
```

迁移脚本会：

1. 使用旧 KMS_FALLBACK_KEY 解密所有加密密钥
2. 使用新 KMS_FALLBACK_KEY 重新加密
3. 验证数据完整性

#### 4. 更新 .env

```env
KMS_FALLBACK_KEY="<新密钥>"
```

#### 5. 验证

```bash
# 测试解密功能
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/bdc
```

---

## 数据库密码轮换

**当前状态**: 仍使用旧密码 `AatPd58dj3Sx3PMt`

**步骤**:

1. 在 MySQL 中修改密码:

```sql
ALTER USER 'bdc'@'10.0.0.13' IDENTIFIED BY '<新密码>';
FLUSH PRIVILEGES;
```

2. 更新 .env:

```env
DATABASE_URL=mysql://bdc:<新密码>@10.0.0.13:3306/bdc
```

3. 重启应用验证连接

---

## 影响范围

| 密钥                  | 更换后影响                 | 用户需要操作          |
| --------------------- | -------------------------- | --------------------- |
| JWT_SECRET_KEY        | 所有活跃 JWT 失效          | 重新登录              |
| COOKIE_ENCRYPTION_KEY | 所有 user_info Cookie 失效 | 无（自动从 API 获取） |
| KMS_FALLBACK_KEY      | 数据库加密数据无法解密     | 执行迁移脚本          |
| DATABASE_URL          | 数据库连接失败             | 更新配置并重启        |

---

## 回滚方案

如果轮换后出现问题:

1. **JWT_SECRET_KEY 回滚**: 恢复旧密钥，用户无需重新登录
2. **COOKIE_ENCRYPTION_KEY 回滚**: 恢复旧密钥，Cookie 自动解密
3. **KMS_FALLBACK_KEY 回滚**: 从备份恢复数据库

---

## 验证清单

- [ ] 用户能正常登录
- [ ] Token 刷新功能正常
- [ ] 宅基地列表能正常显示
- [ ] 身份证号/手机号能正常解密
- [ ] 操作日志记录正常
