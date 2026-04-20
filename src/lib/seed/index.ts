/**
 * 种子数据脚本
 * 创建默认管理员用户和角色
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'

/**
 * 初始化系统角色和权限
 */
async function seedRolesAndPermissions() {
  console.log('初始化系统角色和权限...')

  // 创建权限
  const permissions = [
    { code: 'user:manage', name: '用户管理', type: 'MENU' },
    { code: 'user:create', name: '创建用户', type: 'BUTTON' },
    { code: 'user:update', name: '编辑用户', type: 'BUTTON' },
    { code: 'user:delete', name: '删除用户', type: 'BUTTON' },
    { code: 'role:manage', name: '角色管理', type: 'MENU' },
    { code: 'town:manage', name: '镇街管理', type: 'MENU' },
    { code: 'village:manage', name: '村居管理', type: 'MENU' },
    { code: 'bdc:manage', name: '宅基地管理', type: 'MENU' },
    { code: 'bdc:certify', name: '宅基地发证', type: 'BUTTON' },
    { code: 'collective:manage', name: '村集体管理', type: 'MENU' },
    { code: 'stats:view', name: '查看统计', type: 'MENU' },
    { code: 'notification:view', name: '查看通知', type: 'MENU' },
    { code: 'notification:manage', name: '通知管理', type: 'MENU' },
    { code: 'log:view', name: '查看日志', type: 'MENU' },
    { code: 'kms:manage', name: '密钥管理', type: 'MENU' },
    { code: 'contact:view', name: '查看通讯录', type: 'MENU' },
    { code: 'system:settings', name: '系统设置', type: 'MENU' },
  ]

  for (const perm of permissions) {
    const existing = await prisma.sysPermission.findUnique({
      where: { code: perm.code },
    })

    if (!existing) {
      await prisma.sysPermission.create({
        data: perm,
      })
      console.log(`  ✓ 创建权限：${perm.name}`)
    }
  }

  // 创建角色
  const roles = [
    {
      code: 'ADMIN',
      name: '系统管理员',
      description: '拥有所有权限',
    },
    {
      code: 'OPERATOR',
      name: '操作员',
      description: '日常业务操作权限',
    },
    {
      code: 'VIEWER',
      name: '查看者',
      description: '仅查看权限',
    },
  ]

  for (const role of roles) {
    const existing = await prisma.sysRole.findUnique({
      where: { code: role.code },
    })

    if (!existing) {
      await prisma.sysRole.create({
        data: role,
      })
      console.log(`  ✓ 创建角色：${role.name}`)
    }
  }

  // 为管理员角色分配所有权限
  const adminRole = await prisma.sysRole.findUnique({
    where: { code: 'ADMIN' },
    include: { permissions: true },
  })

  if (adminRole && adminRole.permissions.length === 0) {
    const allPermissions = await prisma.sysPermission.findMany()

    for (const perm of allPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      })
    }
    console.log('  ✓ 为管理员分配所有权限')
  }
}

/**
 * 创建默认管理员用户
 */
async function seedDefaultAdmin() {
  console.log('创建默认管理员用户...')

  const existingUser = await prisma.sysUser.findUnique({
    where: { username: 'admin' },
  })

  if (existingUser) {
    console.log('  管理员用户已存在，跳过')
    return
  }

  // 密码加密（bcrypt 异步）
  const { passwordHash, salt } = await hashUserPassword('admin123')

  // 创建用户
  const adminUser = await prisma.sysUser.create({
    data: {
      username: 'admin',
      passwordHash,
      salt,
      realName: '系统管理员',
      status: 'ACTIVE',
    },
  })

  // 获取管理员角色
  const adminRole = await prisma.sysRole.findUnique({
    where: { code: 'ADMIN' },
  })

  if (adminRole) {
    // 关联用户和角色
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    })
    console.log('  ✓ 创建管理员用户并分配角色')
  }

  console.log(`  用户名：admin`)
  console.log(`  密码：admin123`)
}

/**
 * 运行所有种子脚本
 */
export async function seedAll() {
  console.log('=== 开始初始化种子数据 ===\n')

  try {
    await seedRolesAndPermissions()
    console.log('')
    await seedDefaultAdmin()
    console.log('\n=== 种子数据初始化完成！ ===')
  } catch (error) {
    console.error('种子数据初始化失败:', error)
    throw error
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  seedAll()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('执行失败:', error)
      process.exit(1)
    })
}
