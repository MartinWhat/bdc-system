# BDC System - 不动产证书综合管理系统

宅基地信息管理、村集体所有权管理于一体的信息化管理平台。

## 技术栈

- **框架**: Next.js 16.x
- **语言**: TypeScript
- **UI 组件**: Ant Design
- **状态管理**: Zustand
- **数据请求**: TanStack Query
- **表单**: React Hook Form + Zod
- **ORM**: Prisma
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **国密算法**: sm-crypto (SM2/SM3/SM4)

## 项目结构

```
src/
├── app/              # Next.js 应用路由
│   ├── (zjd)/        # 宅基地管理
│   ├── (lingzheng)/  # 领证端
│   ├── (jtsyq)/      # 村集体所有权
│   ├── (tongji)/     # 统计报表
│   ├── (shezhi)/     # 后台设置
│   ├── api/          # API 路由
│   └── login/        # 登录页
├── components/       # React 组件
├── lib/              # 工具库
│   ├── gm-crypto/    # 国密算法
│   ├── kms/          # 本地密钥管理
│   ├── auth/         # 认证模块
│   ├── middleware/   # 中间件
│   └── session/      # 会话管理
├── hooks/            # React Hooks
└── middleware.ts     # Next.js 中间件
```

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

### 开发服务器

```bash
npm run dev
```

### 运行测试

```bash
npm run test          # 监听模式
npm run test:run      # 运行一次
npm run test:coverage # 覆盖率报告
```

## 数据库表

### 一期核心表

| 表名                | 说明           |
| ------------------- | -------------- |
| sys_key_version     | 密钥版本表     |
| sys_user            | 用户表         |
| sys_role            | 角色表         |
| sys_permission      | 权限表         |
| sys_user_role       | 用户角色关联表 |
| sys_role_permission | 角色权限关联表 |
| sys_session         | 会话表         |
| sys_town            | 镇街表         |
| sys_village         | 村居表         |
| zjd_bdc             | 宅基地单元表   |
| zjd_receive_record  | 领证记录表     |
| sys_operation_log   | 操作日志表     |

## 国密算法

### SM3 哈希算法

- 数据完整性校验
- 密码加密（+ 盐值）
- 哈希索引（加密字段查询）

### SM4 对称加密

- 敏感数据加密（身份证、手机号）
- CBC 模式

### SM2 非对称加密

- 电子签名（二期实现）

## 开发计划

详见 [plan-lite.md](../plan-lite.md)

## 许可证

MIT
