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
    { code: 'user:read', name: '查看用户', type: 'BUTTON' },
    { code: 'role:manage', name: '角色管理', type: 'MENU' },
    { code: 'permission:read', name: '查看权限', type: 'BUTTON' },
    { code: 'town:manage', name: '镇街管理', type: 'MENU' },
    { code: 'village:manage', name: '村居管理', type: 'MENU' },
    { code: 'bdc:read', name: '查看宅基地', type: 'MENU' },
    { code: 'bdc:create', name: '创建宅基地', type: 'BUTTON' },
    { code: 'bdc:update', name: '编辑宅基地', type: 'BUTTON' },
    { code: 'bdc:delete', name: '删除宅基地', type: 'BUTTON' },
    { code: 'collective:read', name: '查看村集体证书', type: 'MENU' },
    { code: 'collective:create', name: '创建村集体证书', type: 'BUTTON' },
    { code: 'objection:read', name: '查看异议', type: 'MENU' },
    { code: 'objection:create', name: '创建异议', type: 'BUTTON' },
    { code: 'objection:write', name: '处理异议', type: 'BUTTON' },
    { code: 'objection:manage', name: '异议流程管理', type: 'MENU' },
    { code: 'receive:read', name: '查看领证记录', type: 'MENU' },
    { code: 'receive:create', name: '创建领证记录', type: 'BUTTON' },
    { code: 'upload:file', name: '上传文件', type: 'BUTTON' },
    { code: 'contact:read', name: '查看通讯录', type: 'MENU' },
    { code: 'contact:manage', name: '通讯录管理', type: 'MENU' },
    { code: 'stats:read', name: '查看统计', type: 'MENU' },
    { code: 'notification:view', name: '查看通知', type: 'MENU' },
    { code: 'notification:create', name: '创建通知', type: 'BUTTON' },
    { code: 'notification:manage', name: '通知管理', type: 'MENU' },
    { code: 'log:view', name: '查看日志', type: 'MENU' },
    { code: 'kms:manage', name: '密钥管理', type: 'MENU' },
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
    {
      code: 'BDC_MANAGER',
      name: '宅基地管理员',
      description: '宅基地管理权限',
    },
    {
      code: 'COLLECTIVE_MANAGER',
      name: '村集体管理员',
      description: '村集体证书管理权限',
    },
    {
      code: 'OBJECTION_HANDLER',
      name: '异议处理员',
      description: '异议处理权限',
    },
    {
      code: 'RECEIVE_CLERK',
      name: '领证办事员',
      description: '领证记录管理权限',
    },
    {
      code: 'CONTACT_MANAGER',
      name: '通讯录管理员',
      description: '通讯录管理权限',
    },
    {
      code: 'STATS_VIEWER',
      name: '统计查看员',
      description: '查看统计报表权限',
    },
    {
      code: 'TOWN_ADMIN',
      name: '镇街管理员',
      description: '镇街级数据管理权限',
    },
    {
      code: 'VILLAGE_ADMIN',
      name: '村居管理员',
      description: '村居级数据管理权限',
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
    // 确保已有用户分配了 ADMIN 角色
    const adminRole = await prisma.sysRole.findUnique({
      where: { code: 'ADMIN' },
    })
    if (adminRole) {
      const existingUserRole = await prisma.userRole.findUnique({
        where: {
          userId_roleId: {
            userId: existingUser.id,
            roleId: adminRole.id,
          },
        },
      })
      if (!existingUserRole) {
        await prisma.userRole.create({
          data: {
            userId: existingUser.id,
            roleId: adminRole.id,
          },
        })
        console.log('  ✓ 为已有管理员用户补充分配角色')
      }
    }
    console.log('  管理员用户已存在，跳过创建')
    return
  }

  // 密码加密（bcrypt）
  const passwordHash = await hashUserPassword('admin123')

  // 创建用户
  const adminUser = await prisma.sysUser.create({
    data: {
      username: 'admin',
      passwordHash,
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
