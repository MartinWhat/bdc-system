/**
 * 添加异议模块权限
 */

import { prisma } from '@/lib/prisma'

async function addObjectionPermissions() {
  console.log('=== 添加异议模块权限 ===\n')

  // 1. 创建权限
  const permissions = [
    {
      code: 'objection:read',
      name: '异议查看',
      type: 'MODULE',
      resource: 'objection',
      description: '查看异议列表和详情',
    },
    {
      code: 'objection:manage',
      name: '异议管理',
      type: 'MODULE',
      resource: 'objection',
      description: '管理异议流程和审批',
    },
  ]

  for (const perm of permissions) {
    const existing = await prisma.sysPermission.findUnique({
      where: { code: perm.code },
    })

    if (existing) {
      console.log(`  权限 ${perm.code} 已存在，跳过`)
      continue
    }

    await prisma.sysPermission.create({
      data: perm,
    })
    console.log(`  ✓ 创建权限：${perm.code} (${perm.name})`)
  }

  // 2. 获取管理员角色并分配权限
  const adminRole = await prisma.sysRole.findUnique({
    where: { code: 'ADMIN' },
  })

  if (!adminRole) {
    console.log('\n❌ 管理员角色不存在')
    return
  }

  for (const permCode of ['objection:read', 'objection:manage']) {
    const perm = await prisma.sysPermission.findUnique({
      where: { code: permCode },
    })

    if (!perm) continue

    const existing = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
    })

    if (existing) {
      console.log(`  管理员已有权限 ${permCode}，跳过`)
      continue
    }

    await prisma.rolePermission.create({
      data: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    })
    console.log(`  ✓ 分配权限 ${permCode} 给管理员`)
  }

  // 3. 创建异议处理员角色（可选）
  const handlerRole = await prisma.sysRole.findUnique({
    where: { code: 'OBJECTION_HANDLER' },
  })

  if (!handlerRole) {
    await prisma.sysRole.create({
      data: {
        code: 'OBJECTION_HANDLER',
        name: '异议处理员',
        description: '负责处理异议申请',
        status: 'ACTIVE',
      },
    })
    console.log(`  ✓ 创建角色：异议处理员`)
  }

  // 4. 验证结果
  const adminPerms = await prisma.sysRole.findUnique({
    where: { code: 'ADMIN' },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  })

  console.log('\n管理员当前权限：')
  adminPerms?.permissions.forEach((rp) => {
    console.log(`  - ${rp.permission.code}`)
  })

  console.log('\n✅ 异议权限添加完成')
}

addObjectionPermissions()
  .catch((err) => {
    console.error('执行失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
