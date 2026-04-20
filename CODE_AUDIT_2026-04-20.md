# 代码审查报告

**项目**: BDC 不动产证书综合管理系统 (`zjd`)
**审查日期**: 2026-04-20
**审查范围**: 认证安全、API 路由、数据库设计

---

## 一、安全审计报告

### CRITICAL 级别

| #   | 问题                      | 位置                             | 说明                                                                                                     |
| --- | ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Token 存储在 localStorage | `src/lib/token-manager.ts:28-32` | XSS 攻击可直接窃取 accessToken 和 refreshToken。应改用 httpOnly + Secure + SameSite=Strict Cookie        |
| 2   | 弱密码哈希 (SM3 单次迭代) | `src/lib/gm-crypto/sm3.ts:68-84` | `sm3Hash(password + salt)` 非标准密码哈希，可被 GPU/彩虹表攻击。应使用 bcrypt/argon2，配以高 work factor |
| 3   | RefreshToken 明文存储     | `prisma/schema.prisma:169-170`   | `SysSession.refreshToken` 存明文，数据库泄露则攻击者直接重放。应存 SM3HMac 哈希值                        |

### HIGH 级别

| #   | 问题                        | 位置                                 | 说明                                                                                                 |
| --- | --------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 4   | 登录接口无速率限制          | `src/app/api/login/route.ts`         | 可无限暴力猜解密码                                                                                   |
| 5   | Token 刷新接口无速率限制    | `src/app/api/token/refresh/route.ts` | 可被用于令牌枚举和 DoS                                                                               |
| 6   | Token 刷新竞态条件 (TOCTOU) | `src/lib/session/index.ts:113-151`   | 两请求同时用同一 refreshToken 都通过验证后才轮换。应使用原子操作 `UPDATE ... WHERE refreshToken = X` |
| 7   | 访问令牌无法主动撤销        | `src/lib/session/index.ts`           | 令牌泄露后需等 30 分钟才过期。应实现令牌黑名单                                                       |
| 8   | KMS Fallback Key 无法轮换   | `src/lib/kms/index.ts:95-102`        | 环境变量 `KMS_FALLBACK_KEY` 无法热更新，代码级密钥硬编码                                             |
| 9   | RefreshToken 通过请求体传输 | `src/lib/api-fetch.ts:131-137`       | 未使用 httpOnly Cookie，暴露于 XSS 和 CSRF 风险                                                      |

### MEDIUM 级别

| #   | 问题                              | 位置                                       | 说明                                                                         |
| --- | --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| 10  | JWT 验证失败静默忽略              | `src/lib/auth/jwt.ts:82-110`               | `verifyJWT` 所有异常返回 null，无法区分"签名错误"、"过期"、"格式错误"等类型  |
| 11  | SM4 密钥轮换不迁移数据            | `src/lib/kms/index.ts:271-279`             | `rotateKey` 只激活新密钥，已加密数据仍用旧密钥，不适合密钥轮换合规要求       |
| 12  | Token 刷新接口未验证 Content-Type | `src/app/api/token/refresh/route.ts:23-26` | 未校验 `Content-Type: application/json`，可接受任意内容类型                  |
| 13  | 用户信息暴露在响应头              | `src/lib/middleware/auth.ts:82-86`         | `x-user-id`、`x-username`、`x-user-roles` 等头信息可能泄露给代理或浏览器历史 |

### LOW 级别

| #   | 问题                   | 位置                                 | 说明                                                              |
| --- | ---------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| 14  | 公开路径匹配过于宽松   | `src/lib/middleware/auth.ts:25`      | `pathname.startsWith(path)` 可能错误匹配 `/api/login-fake` 等路径 |
| 15  | 登录失败日志包含用户名 | `src/app/api/login/route.ts:148-154` | 失败日志记录用户名，可助长用户枚举攻击                            |
| 16  | 缺失 CSRF 保护         | `src/app/api/token/refresh/route.ts` | 未实现 CSRF Token                                                 |

---

## 二、API 路由质量审计报告

### CRITICAL 级别

| #   | 问题                     | 位置                                      | 说明                                                        |
| --- | ------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| 1   | kms/keys POST 无授权校验 | `src/app/api/kms/keys/route.ts:53-90`     | 创建加密密钥无需任何权限，可被任意用户调用                  |
| 2   | villages POST 无授权校验 | `src/app/api/villages/route.ts:68-127`    | 任意用户可创建村居数据                                      |
| 3   | roles POST 无授权校验    | `src/app/api/roles/route.ts:55-116`       | 任意用户可创建角色，可提升为管理员                          |
| 4   | 信任 x-user-id 请求头    | `src/app/api/users/[id]/route.ts:170-176` | 直接信任请求头中的用户 ID，而非通过中间件获取，存在 ID 欺骗 |

### HIGH 级别

| #   | 问题                         | 位置                                       | 说明                                                   |
| --- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| 5   | 用户更新角色存在竞态         | `src/app/api/users/[id]/route.ts:122-141`  | 先删除角色再批量插入，中间窗口另一请求可修改角色       |
| 6   | kms/keys 激活存在竞态        | `src/app/api/kms/keys/route.ts:73-79`      | 检查密钥存在和激活密钥之间存在竞态窗口                 |
| 7   | kms/migrate 无幂等性和事务   | `src/app/api/kms/migrate/route.ts:39-56`   | 无事务保护，迁移失败时部分数据已用新密钥加密，无法回滚 |
| 8   | kms/keys 缺少 Zod 校验       | `src/app/api/kms/keys/route.ts:54-63`      | 手动校验而非使用 Zod Schema，`keyType` 枚举值未校验    |
| 9   | 状态过滤 Bug (重复检查 type) | `src/app/api/notifications/route.ts:36-42` | `if (type)` 判断两次，`status` 过滤条件从未生效        |

### MEDIUM 级别

| #   | 问题                  | 位置                                                                          | 说明                                                   |
| --- | --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| 10  | villages GET 缺失分页 | `src/app/api/villages/route.ts:40-55`                                         | 返回全量数据，大数据集时性能问题                       |
| 11  | roles GET 缺失分页    | `src/app/api/roles/route.ts:29-42`                                            | 返回全量数据                                           |
| 12  | contacts N+1 解密     | `src/app/api/contacts/route.ts:108-114`                                       | 每条记录逐个调用 `decryptSensitiveField`，而非批量解密 |
| 13  | `any` 类型滥用        | `src/app/api/kms/keys/route.ts:28`                                            | `const allKeys: any[] = []` 丢失类型安全               |
| 14  | 多端点缺失操作日志    | `bdc/route.ts`、`bdc/[id]/route.ts`、`villages/route.ts`、`roles/route.ts` 等 | 敏感操作未记录审计日志                                 |

### LOW 级别

| #   | 问题                    | 位置                                           | 说明                                                          |
| --- | ----------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| 15  | villages 响应格式不一致 | `src/app/api/villages/route.ts:57-60, 119-122` | 列表接口直接返回数组，POST 返回单个对象，与其他接口格式不统一 |
| 16  | kms/migrate 错误被吞没  | `src/app/api/kms/migrate/route.ts:53-56`       | `catch` 块只 console.error 后继续，不返回错误给调用方         |

---

## 三、数据库与 Prisma 审计报告

### CRITICAL 级别

| #   | 问题                        | 位置                                    | 说明                                                                                                       |
| --- | --------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | VILLAGE/TOWN 数据权限未实现 | `src/lib/auth/data-permission.ts:22-52` | 返回 `scope: 'VILLAGE'` 或 `scope: 'TOWN'` 时，`villageIds`/`townIds` 数组从未赋值，实际退化为 `SELF` 范围 |

### HIGH 级别

| #   | 问题                   | 位置                                    | 说明                                                                                                                                                                                                                        |
| --- | ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | 外键缺失索引           | `prisma/schema.prisma`                  | `SysUser.villageId` (L98)、`SysVillage.townId` (L194,201)、`SysSession.userId` (L162)、`OperationLog.userId` (L305)、`OperationLog.bdcId` (L306)、`NotificationRead.userId` (L454) 等外键无索引，数据增长后存在全表扫描风险 |
| 3   | 外键无级联删除策略     | `prisma/schema.prisma`                  | `SysUser.villageId`、`ZjdBdc.villageId`、`CollectiveCert.villageId` 等删除时无 `onDelete: Cascade/SetNull`，导致孤儿数据                                                                                                    |
| 4   | 权限过滤器错误返回 ALL | `src/lib/auth/data-permission.ts:47-51` | 数据库异常时返回 `scope: 'ALL'`，安全风险——应降级为 `SELF`                                                                                                                                                                  |

### MEDIUM 级别

| #   | 问题                    | 位置                                    | 说明                                                                             |
| --- | ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| 5   | SQLite 使用 Prisma Enum | `prisma/schema.prisma:11-54`            | SQLite 不支持原生 Enum，`ReceiveStatus`、`ObjectionStatus` 等在 DB 层无约束      |
| 6   | 权限检查时过度获取字段  | `src/lib/auth/data-permission.ts:24-33` | 获取完整 SysRole 对象，仅为检查 `code === 'ADMIN'`，可用 `select` 只取 code 字段 |

### LOW 级别

| #   | 问题                       | 位置                    | 说明                             |
| --- | -------------------------- | ----------------------- | -------------------------------- |
| 7   | Prisma Client 单例模式正确 | `src/lib/prisma.ts:1-9` | 实现正确，开发环境热重载下无问题 |

---

## 四、优先修复建议

### P0（立即修复）

1. **修复数据权限过滤器** (`src/lib/auth/data-permission.ts`)  
   VILLAGE/TOWN 范围未正确实现，当前会降级为 SELF，导致非管理员用户无法查看下级数据

2. **修复认证安全**
   - Token 从 localStorage 迁移到 httpOnly Cookie
   - 密码哈希从 SM3 替换为 bcrypt (cost factor ≥ 12)
   - RefreshToken 存储哈希值

3. **授权校验缺失**
   - `kms/keys` POST — 需 ADMIN 权限
   - `villages` POST — 需镇街级管理员
   - `roles` POST — 需超管
   - 修复 `users/[id]/route.ts` 对 `x-user-id` 头的信任

### P1（短期内修复）

4. **添加缺失索引** — 所有外键字段添加索引

5. **实现速率限制** — login 和 token/refresh 接口

6. **修复 Token 刷新竞态条件** — 使用原子更新操作

7. **kms/migrate 事务化** — 迁移失败需可回滚

8. **添加操作日志** — BDC、villages、roles 等核心实体的增删改操作

### P2（后续迭代）

9. SM4 密钥轮换时后台迁移已有数据
10. 实现访问令牌黑名单（短期：Redis，长期：数据库）
11. JWT 验证错误类型区分与日志记录
12. 登录接口添加账户锁定机制
13. 所有 API 接口添加 Zod Schema 校验

---

_报告生成时间: 2026-04-20_
