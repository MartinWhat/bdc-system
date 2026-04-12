# 一期开发技术文档

## 项目概述

不动产证书综合管理系统（BDC System）一期开发已完成。一期主要实现基础功能与国密算法集成。

---

## 开发周期

- **开始时间**: 第1周
- **完成时间**: 第12周
- **总计**: 12周

---

## 已完成功能模块

### 1. 国密基础（第1-3周）

#### 1.1 SM3 哈希算法

- **文件**: `src/lib/gm-crypto/sm3.ts`
- **功能**:
  - `sm3Hash()` - 计算 SM3 哈希值
  - `sm3Hmac()` - 计算 SM3-HMAC 消息认证码
  - `generateSalt()` - 生成随机盐值
  - `encryptPassword()` - 密码加密（SM3 + 盐值）
  - `verifyPassword()` - 密码验证
  - `generateHashIndex()` - 生成哈希索引（用于加密字段查询）

#### 1.2 SM4 对称加密

- **文件**: `src/lib/gm-crypto/sm4.ts`
- **功能**:
  - `sm4Encrypt()` - SM4-CBC 加密
  - `sm4Decrypt()` - SM4-CBC 解密
  - `generateSM4Key()` - 生成 SM4 密钥

#### 1.3 LocalKMS 密钥管理

- **文件**: `src/lib/kms/index.ts`
- **功能**:
  - 密钥生成、存储、轮换
  - 密钥激活与过期检查
  - 密钥访问审计
- **密钥类型**:
  - `MASTER_KEY` - 主密钥（365天轮换）
  - `SM4_DATA` - 数据加密密钥（90天轮换）
  - `SM2_SIGN` - 签名私钥（365天轮换）
  - `JWT_SECRET` - JWT 签名密钥（30天轮换）

#### 1.4 敏感数据加密服务

- **文件**: `src/lib/gm-crypto/encryption.ts`
- **功能**:
  - 自动加密敏感字段（身份证、手机号）
  - 哈希索引生成（支持加密字段查询）
  - 加密中间件工厂函数

---

### 2. 认证系统（第4-5周）

#### 2.1 JWT 认证

- **文件**: `src/lib/auth/jwt.ts`
- **功能**:
  - SM3-HMAC JWT 签名与验证
  - Base64URL 编码/解码
  - 令牌提取与解析

#### 2.2 用户服务

- **文件**: `src/lib/auth/user-service.ts`
- **功能**:
  - 用户创建（含密码加密）
  - 用户凭据验证
  - 用户权限/角色查询
  - 最后登录时间更新

#### 2.3 会话管理

- **文件**: `src/lib/session/index.ts`
- **功能**:
  - 会话创建/验证/销毁
  - 过期会话清理
  - 用户会话管理

#### 2.4 API 路由

- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

#### 2.5 前端页面

- `/login` - 登录页面（Ant Design 表单）
- `/dashboard` - 工作台页面

---

### 3. 用户管理与权限系统（第6-7周）

#### 3.1 RBAC 权限模型

- **数据表**:
  - `sys_user` - 用户表
  - `sys_role` - 角色表
  - `sys_permission` - 权限表
  - `sys_user_role` - 用户角色关联表
  - `sys_role_permission` - 角色权限关联表

#### 3.2 API 路由

- `GET/POST /api/users` - 用户列表/创建
- `GET/PUT/DELETE /api/users/[id]` - 用户详情/更新/删除
- `GET/POST /api/roles` - 角色列表/创建
- `GET/PUT/DELETE /api/roles/[id]` - 角色详情/更新/删除
- `GET /api/permissions` - 权限列表

#### 3.3 前端页面

- `/users` - 用户管理页面
- `/roles` - 角色管理页面

#### 3.4 数据权限服务

- **文件**: `src/lib/auth/data-permission.ts`
- **数据范围**:
  - `ALL` - 全部数据
  - `TOWN` - 镇街级数据
  - `VILLAGE` - 村居级数据
  - `SELF` - 仅本人数据

---

### 4. 基础数据管理（第8周）

#### 4.1 镇街管理

- **API**: `GET/POST /api/towns`, `GET/PUT/DELETE /api/towns/[id]`
- **页面**: `/towns`
- **功能**: CRUD、级联删除保护

#### 4.2 村居管理

- **API**: `GET/POST /api/villages`, `GET/PUT/DELETE /api/villages/[id]`
- **页面**: `/villages`
- **功能**: CRUD、镇街关联查询

#### 4.3 级联选择器

- **组件**: `src/components/TownVillageCascader.tsx`
- **功能**: 镇街-村居二级联动选择

---

### 5. 宅基地管理核心（第9-10周）

#### 5.1 API 路由

- `GET/POST /api/bdc` - 宅基地列表/创建
- `GET/PUT/DELETE /api/bdc/[id]` - 详情/更新/删除
- `PUT /api/bdc/[id]/status` - 状态管理
- `GET /api/bdc/query` - 加密查询（身份证号/手机号）

#### 5.2 状态管理

- **状态流转**:
  - `PENDING` → `APPROVED` → `CERTIFIED` → `CANCELLED`
  - 每个状态只能流转到允许的下一状态
  - 自动记录发证日期

#### 5.3 加密查询

- 通过身份证号查询（SM3 哈希索引）
- 通过手机号查询
- 查询结果自动脱敏

#### 5.4 前端页面

- `/bdc` - 宅基地管理页面
  - 列表展示（分页、筛选）
  - 创建/编辑模态框
  - 详情展示
  - 快速操作（审核、注销）
  - 高级查询（身份证号/手机号）

---

### 6. 操作日志与数据脱敏（第11周）

#### 6.1 日志服务

- **文件**: `src/lib/log/index.ts`
- **功能**:
  - `logOperation()` - 记录操作日志
  - `queryOperationLogs()` - 分页查询日志
  - `getOperationLogStats()` - 日志统计
  - `cleanupOldLogs()` - 清理过期日志（默认180天）

#### 6.2 日志 API

- `GET /api/logs` - 分页查询日志列表
- `GET /api/logs/stats` - 获取日志统计

#### 6.3 日志中间件

- **文件**: `src/lib/middleware/log.ts`
- **预定义中间件**:
  - `LogMiddleware.user` - 用户管理日志
  - `LogMiddleware.role` - 角色管理日志
  - `LogMiddleware.bdc` - 宅基地管理日志
  - `LogMiddleware.auth` - 认证日志

#### 6.4 前端页面

- `/logs` - 操作日志页面
  - 统计卡片（总操作数、成功/失败数）
  - 高级筛选（模块、操作、状态、时间范围）
  - 日志列表（分页、显示关联信息）

#### 6.5 数据脱敏

- **文件**: `src/lib/utils/mask.ts`
- **功能**:
  - 身份证脱敏：`110***********1234`
  - 手机号脱敏：`138****8000`
  - 姓名脱敏：`张*`
  - 地址脱敏：`北京市朝阳区建国路1***`

---

## 数据库设计

### 核心数据表（12张）

| 表名                  | 说明           | 关键字段                              |
| --------------------- | -------------- | ------------------------------------- |
| `sys_key_version`     | 密钥版本表     | keyType, version, isActive, expiresAt |
| `sys_user`            | 用户表         | username, passwordHash, idCardHash    |
| `sys_role`            | 角色表         | name, code, status                    |
| `sys_permission`      | 权限表         | name, code, type                      |
| `sys_user_role`       | 用户角色关联表 | userId, roleId                        |
| `sys_role_permission` | 角色权限关联表 | roleId, permissionId                  |
| `sys_session`         | 会话表         | userId, token, expiresAt              |
| `sys_town`            | 镇街表         | code, name, status                    |
| `sys_village`         | 村居表         | townId, code, name                    |
| `zjd_bdc`             | 宅基地单元表   | villageId, certNo, idCardHash, status |
| `zjd_receive_record`  | 领证记录表     | bdcId, applicantId, status            |
| `sys_operation_log`   | 操作日志表     | userId, bdcId, action, module         |

### 索引优化

已创建 30+ 个索引，覆盖：

- 外键字段
- 查询频繁字段
- 哈希索引字段
- 状态字段
- 时间字段

---

## 测试覆盖

### 单元测试

- **国密算法**: 15 个测试
- **加密服务**: 10 个测试
- **认证服务**: 9 个测试
- **基础数据**: 8 个测试
- **宅基地管理**: 8 个测试
- **操作日志**: 9 个测试

### 端到端测试

- **完整业务流程**: 4 个测试
- **数据完整性**: 3 个测试
- **加密功能**: 1 个测试

### 测试结果

```
Test Files: 7 passed
Tests: 67 passed
```

---

## 技术栈

| 类别     | 技术                              |
| -------- | --------------------------------- |
| 框架     | Next.js 16.x                      |
| 语言     | TypeScript                        |
| UI 组件  | Ant Design                        |
| 状态管理 | Zustand                           |
| 数据请求 | TanStack Query                    |
| 表单     | React Hook Form + Zod             |
| ORM      | Prisma                            |
| 数据库   | SQLite (开发) / PostgreSQL (生产) |
| 国密算法 | sm-crypto (SM3/SM4)               |
| 测试框架 | Vitest                            |

---

## 项目结构

```
src/
├── app/
│   ├── (zjd)/              # 宅基地管理
│   │   ├── layout.tsx
│   │   └── bdc/page.tsx
│   ├── (shezhi)/           # 后台设置
│   │   ├── layout.tsx
│   │   ├── users/page.tsx
│   │   ├── roles/page.tsx
│   │   ├── towns/page.tsx
│   │   ├── villages/page.tsx
│   │   └── logs/page.tsx
│   ├── api/                # API 路由
│   │   ├── login/route.ts
│   │   ├── logout/route.ts
│   │   ├── auth/me/route.ts
│   │   ├── users/route.ts
│   │   ├── users/[id]/route.ts
│   │   ├── roles/route.ts
│   │   ├── roles/[id]/route.ts
│   │   ├── permissions/route.ts
│   │   ├── towns/route.ts
│   │   ├── towns/[id]/route.ts
│   │   ├── villages/route.ts
│   │   ├── villages/[id]/route.ts
│   │   ├── bdc/route.ts
│   │   ├── bdc/[id]/route.ts
│   │   ├── bdc/[id]/status/route.ts
│   │   ├── bdc/query/route.ts
│   │   ├── logs/route.ts
│   │   └── logs/stats/route.ts
│   ├── login/page.tsx
│   └── dashboard/page.tsx
├── components/
│   └── TownVillageCascader.tsx
├── lib/
│   ├── gm-crypto/          # 国密算法
│   │   ├── sm3.ts
│   │   ├── sm4.ts
│   │   ├── encryption.ts
│   │   ├── query.ts
│   │   └── index.ts
│   ├── kms/                # 密钥管理
│   │   ├── index.ts
│   │   └── seed.ts
│   ├── auth/               # 认证模块
│   │   ├── jwt.ts
│   │   ├── user-service.ts
│   │   ├── data-permission.ts
│   │   ├── utils.ts
│   │   └── index.ts
│   ├── session/            # 会话管理
│   │   └── index.ts
│   ├── middleware/         # 中间件
│   │   ├── auth.ts
│   │   └── log.ts
│   ├── log/                # 操作日志
│   │   └── index.ts
│   ├── seed/               # 种子数据
│   │   └── index.ts
│   ├── store/              # 状态管理
│   │   └── auth.ts
│   ├── utils/              # 工具函数
│   │   └── mask.ts
│   └── prisma.ts
├── test/
│   └── helpers.ts
└── middleware.ts
```

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
# .env
DATABASE_URL="file:./dev.db"
```

### 数据库迁移

```bash
npx prisma migrate dev
```

### 初始化种子数据

```bash
npm run seed
```

### 运行测试

```bash
npm run test          # 监听模式
npm run test:run      # 运行一次
npm run test:coverage # 覆盖率报告
```

### 启动开发服务器

```bash
npm run dev
```

---

## 默认账号

- **用户名**: admin
- **密码**: admin123
- **角色**: 系统管理员（拥有所有权限）

---

## 下一步计划

### 二期：流程功能 + 电子签名合规（10周）

- 领证流程
- 电子签名（Canvas 签名、SM2 签名、CA 证书）
- 领证人拍照
- 数据同步

### 二期+：村集体所有权管理（4周）

- 证书入库/出库
- 状态管理
- 统计查询

### 三期：统计优化（6周）

- 统计报表
- 报表导出（Excel/PDF）
- 系统性能优化

### 四期：验收测试 + GMTLS（4周）

- 合规审计
- 安全测试
- 传输层安全

### 五期：上线部署 + 运维保障（2周）

- 生产环境部署
- 监控告警
- 运维保障

---

## 注意事项

1. **密钥安全**: 密钥不得硬编码或提交版本控制
2. **密钥轮换**: 按周期自动轮换，历史版本保留1年
3. **加密查询**: 使用 SM3 哈希索引，不支持模糊查询
4. **审计日志**: 保留至少6个月
5. **双因素认证**: 管理员必须启用（二期实现）

---

**文档版本**: v1.0  
**最后更新**: 2026年4月11日  
**作者**: BDC 开发团队
