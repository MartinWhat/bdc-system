# 代码审计报告

> 审计时间: 2026/04/12
> 审计范围: `/Users/chen/Code/bdc1/zjd`
> 技术栈: Next.js 16.2.3 + TypeScript + Prisma (SQLite) + Ant Design + Zustand + 国密算法 (SM2/3/4)

---

## 严重问题 (Critical)

### 1. KMS 密钥存储使用哈希而非加密

**文件**: `src/lib/kms/index.ts:83`

```typescript
const encryptedValue = sm3Hash(keyValue) // 占位：实际应用 SM4 加密
```

**问题**: 密钥值只使用 SM3 哈希存储，未使用任何加密算法。SM3 是哈希函数，不可逆，无法还原但也意味着密钥以明文哈希形式暴露。若数据库泄露，攻击者可获取所有密钥的哈希值并用于认证。

**建议**: 使用 SM4 加密 `keyValue` 后存储，解密后用于业务。

---

### 2. JWT 签名密钥可预测

**文件**: `src/lib/kms/index.ts:47-48`

```typescript
case 'JWT_SECRET':
  return generateSalt(32)
```

**问题**: JWT 签名依赖 `getActiveKey('JWT_SECRET')` 从数据库读取密钥值。由于问题 #1，数据库中的密钥只是哈希值而非加密值。加上 JWT 的 `sub` 直接作为用户身份（问题 #4），攻击者在主密钥泄露后可伪造任意用户身份的 JWT。

**建议**: 确保数据库中 JWT 密钥以加密形式存储，同时 KMS 的 SM4 加密实现要真正加密而非哈希。

---

### 3. 数据权限过滤被注释 — 等于没有权限控制

**文件**: `src/app/api/bdc/route.ts:58-63`

```typescript
// TODO: 应用数据权限过滤
// if (userId) {
//   const filter = await getDataPermissionFilter(userId)
//   const dataWhere = buildBdcWhereClause(filter)
//   Object.assign(where, dataWhere)
// }
```

**问题**: 当前所有认证用户可查看**所有**宅基地数据，数据权限形同虚设。

**建议**: 取消注释并完善 `getDataPermissionFilter` 中 `townIds`/`villageIds` 的获取逻辑（当前恒为空数组）。

---

### 4. 菜单链接指向不存在的页面 — 3 个空路由组

**文件**: `src/app/(zjd)/layout.tsx:31,36`

| 菜单 key     | 路由                         | 状态              |
| ------------ | ---------------------------- | ----------------- |
| `/bdc`       | `src/app/(zjd)/bdc/page.tsx` | 存在              |
| `/lingzheng` | `src/app/(lingzheng)/`       | **空路由组，404** |
| `/stats`     | `src/app/(tongji)/`          | **空路由组，404** |

同时 `src/app/(jtsyq)/` 村集体所有权 模块也是空的。

**建议**: 要么实现这些页面，要么从菜单中移除对应项。

---

## 中等问题 (Medium)

### 5. `x-user-id` 响应头可被伪造

**文件**: `src/lib/middleware/auth.ts:62-65`

```typescript
response.headers.set('x-user-id', payload.sub)
response.headers.set('x-username', payload.username)
response.headers.set('x-user-roles', JSON.stringify(payload.roles || []))
```

**问题**: JWT 的 `sub` 字段直接作为用户 ID 注入请求头，后续 API 通过 `request.headers.get('x-user-id')` 获取用户身份。结合问题 #2，如果攻击者能伪造 JWT，可冒充任意用户。

**建议**: API 层应重新从数据库查询用户 ID 而非信任请求头中的值，或在中间件中对用户信息做密码学签名。

---

### 6. 登录时序攻击风险

**文件**: `src/app/api/login/route.ts:42-45`

```typescript
{ error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' }
```

**问题**: 用户名不存在和密码错误返回相同错误信息，但响应时间可能不同（数据库查询路径不同），存在时序攻击风险。

**建议**: 无论用户名是否存在，都执行一次等量的哈希计算（如使用固定次数的 PBKDF2），确保响应时间一致。

---

### 7. 双因素认证预留字段无实际功能

**文件**: `prisma/schema.prisma:45`, `src/app/api/login/route.ts:49-58`

```prisma
twoFactorEnabled Boolean @default(false)
```

登录接口中有检查 `twoFactorEnabled` 的代码，但：

- 没有双因素验证码的发送接口
- 没有 TOTP/短信验证码的校验逻辑
- 用户无法在个人设置中启用/禁用

**建议**: 若一期不做，移除相关代码避免误导。

---

### 8. `dotenv` 缺失显式依赖

**文件**: `prisma.config.ts` 导入 `dotenv`，但 `package.json` 中未声明。

可能通过 Prisma 间接依赖，但应显式声明。

---

### 9. BDC 查询接口无权限校验

**文件**: `src/app/api/bdc/query/route.ts:16`

```typescript
export async function GET(request: NextRequest) {
```

此接口通过身份证号或手机号查询宅基地，使用哈希索引查询。虽然走了中间件认证，但用户 A 可以用任意身份证哈希查询用户 B 的宅基地信息，权限粒度不足。

**建议**: 添加数据权限过滤，或限制只有特定角色可调用此接口。

---

### 10. Session 过期未验证

**文件**: `src/lib/session/index.ts`

`SysSession` 表有 `expiresAt` 字段，需确认会话查询时是否检查了过期时间。若未检查，过期会话仍可使用。

---

## 低优先级问题 (Low)

### 11. 脱敏逻辑重复

**文件**:

- `src/app/api/bdc/route.ts:206-215`
- `src/app/api/bdc/query/route.ts:75-84`

两处 `maskIdCard` / `maskPhone` 实现完全相同。应提取到 `@/lib/utils/mask.ts` 统一使用。

---

### 12. `buildBdcWhereClause` 中 Prisma 查询可能无效

**文件**: `src/lib/auth/data-permission.ts:98-102`

```typescript
case 'TOWN':
  if (filter.townIds && filter.townIds.length > 0) {
    where.village = {
      townId: { in: filter.townIds }
    }
  }
```

`ZjdBdc` 通过 `villageId` 关联到 `SysVillage`，再通过 `townId` 关联到 `SysTown`。Prisma 当前写法在没正确 include 的情况下不会自动 join，可能查不到数据。

---

### 13. `.gitignore` 包含 Yarn 配置但项目用 npm

项目使用 `package-lock.json`，但 `.gitignore` 有 `!.yarn/patches`、`!.yarn/plugins` 等 Yarn 相关条目。

---

### 14. `any` 类型滥用

**文件**:

- `src/app/api/bdc/route.ts:39, 154`
- `src/app/api/users/route.ts:47`
- `src/app/api/bdc/query/route.ts:29`

多处 `const where: any = {}`，丢失了 Prisma 类型推断，降低了重构安全性。

---

## 架构观察

| 方面                   | 状态                                               |
| ---------------------- | -------------------------------------------------- |
| 国密算法使用 (SM2/3/4) | 正确用于密码哈希和敏感字段加密                     |
| 密钥轮换机制           | 有框架（`KEY_ROTATION_DAYS`），但 KMS 存储是占位符 |
| 分层结构               | 清晰（lib/api/components 三层）                    |
| 路由分组               | 4 个 route group，3 个是空的                       |
| ORM 类型安全           | 部分丢失（`any`）                                  |
| 数据权限框架           | 有框架但未启用                                     |
| 操作日志               | 有 `OperationLog` 模型但各 API 未调用              |

---

## 优先修复建议

| 优先级 | 问题             | 修复方式                                          |
| ------ | ---------------- | ------------------------------------------------- |
| P0     | KMS 密钥存储加密 | 将 `sm3Hash` 替换为真正的 SM4 加密                |
| P0     | 启用数据权限过滤 | 取消注释 + 完善 townIds/villageIds 获取           |
| P0     | 修复菜单 404     | 实现 `lingzheng`/`stats` 页面或从菜单移除         |
| P1     | JWT 伪造风险     | 确保 KMS 密钥安全 + 考虑在 API 层二次验证用户身份 |
| P1     | BDC 查询接口权限 | 限制只有特定角色可调用                            |
| P2     | 移除 `any`       | 使用 Prisma 正确类型                              |
| P2     | 提取脱敏工具函数 | 合并重复代码                                      |
| P3     | 双因素预留代码   | 若一期不做则移除                                  |
| P3     | dotenv 显式依赖  | 补充到 package.json                               |
