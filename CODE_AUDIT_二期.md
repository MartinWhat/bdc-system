# 二期代码质量审查报告

**审查日期:** 2026年4月13日
**审查范围:** 领证流程模块（二期开发）
**审查工具:** Qwen Code /review

---

## 📊 审查概要

| 类别         | 数量 |
| ------------ | ---- |
| 严重问题     | 7    |
| 高优先级问题 | 15   |
| 中等问题     | 22   |
| 低优先级问题 | 10+  |

**构建状态:** ❌ 失败（1 个 TypeScript 类型错误）
**Lint 检查:** ❌ 44 个错误，74 个警告
**判定结果:** 🔴 **Request Changes**

---

## 🔴 严重问题（Critical）

### 1. TypeScript 构建错误

**File:** `src/app/(auth)/layout.tsx:127`
**Source:** [build]
**Issue:** `menuItems` 类型不匹配 Ant Design Menu 组件的 `ItemType<MenuItemType>`
**Impact:** 构建失败，无法部署
**Suggested fix:**

```typescript
import type { MenuProps } from 'antd'

const menuItems: MenuProps['items'] = [
  // ... 菜单项
]
```

---

### 2. KMS 密钥管理严重缺陷

#### 2.1 `getMasterKeyValue()` 每次返回随机值

**File:** `src/lib/kms/index.ts:66-70`
**Source:** [review]
**Issue:** 函数每次调用都生成新的随机值，完全违背密钥管理的初衷。主密钥应该从安全存储中获取，而不是随机生成。
**Impact:** 无法正确加密/解密其他密钥，数据加密系统失效
**Suggested fix:**

```typescript
async function getMasterKeyValue(): Promise<string> {
  const masterKeyRecord = await prisma.sysKeyVersion.findFirst({
    where: { keyType: 'MASTER_KEY', isActive: true },
    orderBy: { version: 'desc' },
  })

  if (!masterKeyRecord) {
    throw new Error('未找到活跃的主密钥')
  }

  return masterKeyRecord.keyValue
}
```

#### 2.2 `decryptKeyValue` 获取但未使用主密钥

**File:** `src/lib/kms/index.ts:84-113`
**Source:** [review]
**Issue:** 解密函数查询了主密钥但没有使用，而是回退到 fallback 密钥，这是严重的逻辑错误。
**Impact:** 所有密钥解密使用错误的密钥，可能导致解密失败或数据泄露
**Suggested fix:** 使用查询到的主密钥进行解密，而非 fallback

#### 2.3 硬编码默认密钥

**File:** `src/lib/kms/index.ts:85,107`
**Source:** [review]
**Issue:** 硬编码默认密钥 `'0123456789abcdef0123456789abcdef'`
**Impact:** 严重安全隐患，攻击者可直接使用该密钥解密数据
**Suggested fix:**

```typescript
const fallbackKey = process.env.KMS_FALLBACK_KEY
if (!fallbackKey) {
  throw new Error('KMS_FALLBACK_KEY 环境变量未配置')
}
```

#### 2.4 MASTER_KEY 设计矛盾

**File:** `src/lib/kms/index.ts`
**Source:** [review]
**Issue:** 注释说 MASTER_KEY 用于"加密其他密钥"，但实现却使用 SM3 哈希（单向不可逆），导致无法用于解密其他密钥。
**Impact:** 密钥架构设计存在根本性矛盾
**Suggested fix:** 重新设计密钥层级架构，MASTER_KEY 应使用可逆加密存储

---

### 3. 用户身份验证缺失

**File:** 所有 6 个 API 文件
**Source:** [review]
**Issue:** `operatorId` 从 header `x-user-id` 获取，可被客户端任意伪造
**Impact:** 严重安全漏洞，攻击者可以伪造任意用户身份执行操作
**Suggested fix:**

```typescript
// 从 JWT/session 获取真实用户ID，而非 header
import { getCurrentUserId } from '@/lib/auth'

const operatorId = await getCurrentUserId(request)
```

---

### 4. 权限验证缺失

**File:** 所有 6 个 API 文件
**Source:** [review]
**Issue:** 所有接口缺少权限验证中间件
**Impact:** 任意认证用户都可以访问所有功能和数据
**Suggested fix:** 添加权限中间件验证用户是否有权访问

---

### 5. 文件上传无大小限制

**File:** `src/app/api/upload/route.ts:15`
**Source:** [review]
**Issue:** `base64Data` 无大小限制，可上传超大文件
**Impact:** 存储耗尽、服务崩溃风险
**Suggested fix:**

```typescript
base64Data: z.string().max(10 * 1024 * 1024) // 10MB
```

---

## 🟠 高优先级问题

### 数据一致性（缺少事务）

| File                                         | Issue                                            |
| -------------------------------------------- | ------------------------------------------------ |
| `src/app/api/objection/route.ts:73-91`       | 创建异议 + 更新状态 + 创建流程节点，三步无事务   |
| `src/app/api/objection/[id]/route.ts:89-106` | 处理异议 + 更新状态 + 创建流程节点，无事务       |
| `src/app/api/receive/route.ts:103-126`       | 创建领证记录 + 创建流程节点，无事务              |
| `src/app/api/receive/[id]/route.ts:87-159`   | 更新记录 + 更新宅基地状态 + 创建流程节点，无事务 |

**Suggested fix:**

```typescript
await prisma.$transaction(async (tx) => {
  // 所有操作在同一事务中
  await tx.objection.create({...})
  await tx.zjdReceiveRecord.update({...})
  await tx.processNode.create({...})
})
```

---

### 数据库 Schema 问题

| File                   | Issue                                           | Suggested fix                                                     |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `prisma/schema.prisma` | `ZjdReceiveRecord.bdc` 缺少 `onDelete: Cascade` | `@relation(fields: [bdcId], references: [id], onDelete: Cascade)` |
| `prisma/schema.prisma` | `ZjdReceiveRecord` 缺少索引                     | `@@index([bdcId])` `@@index([status])`                            |
| `prisma/schema.prisma` | `ProcessNode` 缺少索引                          | `@@index([receiveRecordId])`                                      |
| `prisma/schema.prisma` | `Objection` 缺少索引                            | `@@index([receiveRecordId])` `@@index([status])`                  |
| `prisma/schema.prisma` | 状态字段使用 String 而非 Enum                   | 定义 enum 并使用                                                  |

---

### 前端安全问题

| File                                    | Issue            | Suggested fix               |
| --------------------------------------- | ---------------- | --------------------------- |
| `src/app/(auth)/lingzheng/page.tsx:328` | 身份证号完整显示 | 使用脱敏函数 `maskIdCard()` |
| `src/app/(auth)/lingzheng/page.tsx:329` | 手机号完整显示   | 使用脱敏函数 `maskPhone()`  |

---

### ESLint 错误

| File                    | Line      | Issue               |
| ----------------------- | --------- | ------------------- |
| `src/lib/log/index.ts`  | 60        | 使用 `any` 类型     |
| `src/lib/utils/mask.ts` | 74-82     | 5 处使用 `any` 类型 |
| `src/lib/kms/index.ts`  | 8, 66, 84 | 未使用的变量        |

---

## 🟡 中等问题

### 输入验证不足

| File                                        | Line  | Issue                         | Suggested fix             |
| ------------------------------------------- | ----- | ----------------------------- | ------------------------- |
| `src/app/api/objection/route.ts`            | 15-18 | `receiveRecordId` 未验证格式  | 添加 `.uuid()` 或格式验证 |
| `src/app/api/objection/route.ts`            | 43-47 | `description` 无长度限制      | 添加 `.max(500)`          |
| `src/app/api/receive/route.ts`              | 17-18 | `pageSize` 无上限（DoS 风险） | `Math.min(pageSize, 100)` |
| `src/app/api/receive/route.ts`              | 24    | `status` 无白名单验证         | 使用 `z.enum([...])`      |
| `src/app/api/receive/[id]/route.ts`         | 22-31 | 身份证/手机号未验证格式       | 添加正则验证              |
| `src/app/api/receive/batch-import/route.ts` | 16-17 | `items` 数组无大小限制        | 添加 `.max(100)`          |
| `src/app/api/upload/route.ts`               | 14    | `fileType` 枚举验证可绕过     | 添加文件内容魔数验证      |

---

### 逻辑问题

| File                                  | Line    | Issue                                                |
| ------------------------------------- | ------- | ---------------------------------------------------- |
| `src/app/api/objection/route.ts`      | 67-70   | 未检查领证记录状态是否允许创建异议                   |
| `src/app/api/objection/[id]/route.ts` | 85-87   | 异议处理后恢复为 ISSUED 状态，未考虑异议期间信息变化 |
| `src/app/api/receive/[id]/route.ts`   | 87-91   | `issue` 操作只检查状态，未检查必要信息               |
| `src/app/api/receive/[id]/route.ts`   | 119-122 | `cancel` 操作未检查当前状态                          |
| `src/app/api/upload/route.ts`         | 34-36   | 未验证领证记录状态是否允许上传                       |

---

### 性能问题

| File                                        | Line    | Issue                         | Suggested fix                    |
| ------------------------------------------- | ------- | ----------------------------- | -------------------------------- |
| `src/app/api/receive/route.ts`              | 27-30   | 深度嵌套 include 查询         | 使用 `select` 精简字段           |
| `src/app/api/receive/batch-import/route.ts` | 39-79   | 循环内逐条数据库操作（4N 次） | 批量查询 + 批量插入              |
| `src/app/(auth)/lingzheng/page.tsx`         | 273-310 | `columns` 每次渲染重新创建    | 使用 `useMemo` 包裹              |
| `src/app/(auth)/lingzheng/page.tsx`         | 210-217 | `getBase64` 每次渲染重新创建  | 提取到组件外部                   |
| `src/app/(auth)/lingzheng/page.tsx`         | 226     | 图片压缩未实现                | 实现 `browser-image-compression` |

---

### 前端错误处理不完整

| File                                | Line    | Issue                                                |
| ----------------------------------- | ------- | ---------------------------------------------------- |
| `src/app/(auth)/lingzheng/page.tsx` | 87-100  | `loadRecords` 未检查 `res.ok`，HTTP 错误状态码被忽略 |
| `src/app/(auth)/lingzheng/page.tsx` | 103-116 | `handleIssue` 同上                                   |
| `src/app/(auth)/lingzheng/page.tsx` | 118-148 | `handleReceive` 同上                                 |
| `src/app/(auth)/lingzheng/page.tsx` | 219-229 | `handlePhotoUpload` Promise 异常未捕获               |

---

## 📋 审查文件清单

| 文件类型 | 文件路径                                    |
| -------- | ------------------------------------------- |
| API      | `src/app/api/objection/route.ts`            |
| API      | `src/app/api/objection/[id]/route.ts`       |
| API      | `src/app/api/receive/route.ts`              |
| API      | `src/app/api/receive/[id]/route.ts`         |
| API      | `src/app/api/receive/batch-import/route.ts` |
| API      | `src/app/api/upload/route.ts`               |
| 前端     | `src/app/(auth)/layout.tsx`                 |
| 前端     | `src/app/(auth)/lingzheng/page.tsx`         |
| 数据库   | `prisma/schema.prisma`                      |
| 密钥管理 | `src/lib/kms/index.ts`                      |
| 测试     | `src/test/helpers.ts`                       |
| 测试     | `src/lib/bdc.test.ts`                       |
| 测试     | `src/lib/gm-crypto/encryption.test.ts`      |

---

## 🔧 优先修复建议

### 第一阶段：安全修复（必须）

1. **修复 KMS 密钥管理**
   - 移除硬编码默认密钥
   - 修正 `getMasterKeyValue()` 和 `decryptKeyValue()` 实现
   - 重新设计 MASTER_KEY 架构

2. **修复用户身份验证**
   - 从 JWT/session 获取用户ID，而非 header
   - 添加权限验证中间件

3. **添加文件上传限制**
   - 添加大小限制和类型验证

### 第二阶段：数据一致性修复

4. **添加事务保护**

   ```typescript
   await prisma.$transaction(async (tx) => {
     // 所有相关操作
   })
   ```

5. **修复 Schema**
   - 添加缺失索引
   - 添加 onDelete Cascade
   - 使用 Enum 类型

### 第三阶段：代码质量修复

6. **修复 TypeScript 错误**
   - 修正 `menuItems` 类型定义

7. **修复 ESLint 错误**
   - 替换 `any` 为具体类型
   - 移除未使用变量

8. **前端优化**
   - 添加数据脱敏
   - 使用 useMemo/useCallback
   - 实现图片压缩

---

## 📈 测试结果

- **构建:** ❌ 失败（TypeScript 错误）
- **Lint:** ❌ 44 errors, 74 warnings
- **测试:** ⏱️ 超时（180s）

---

## 🔒 国密合规检查

| 检查项       | 状态 | 备注                     |
| ------------ | ---- | ------------------------ |
| SM3 密码加密 | ⚠️   | 实现正确，但 KMS 有缺陷  |
| SM4 数据加密 | ⚠️   | 加密正确，密钥管理有问题 |
| LocalKMS     | ❌   | 存在严重设计缺陷         |
| 密钥轮换     | ⚠️   | 配置存在，但实现不完整   |
| 密钥存储     | ❌   | 硬编码默认密钥           |

---

**审查人:** Qwen Code
**审查完成时间:** 2026年4月13日
