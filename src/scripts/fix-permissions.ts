/**
 * 检查并修复用户权限
 */

import { prisma } from '@/lib/prisma'

async function fixUserPermissions() {
  console.log('=== 检查并修复用户权限 ===\n')

  // 获取所有权限
  const allPermissions = await prisma.sysPermission.findMany()
  console.log(`系统共有 ${allPermissions.length} 个权限：`)
  allPermissions.forEach((p) => {
    console.log(`  - ${p.code} (${p.name})`)
  })

  // 获取管理员角色
  const adminRole = await prisma.sysRole.findUnique({
    where: { code: 'ADMIN' },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  })

  if (!adminRole) {
    console.log('\n❌ 管理员角色不存在')
    return
  }

  console.log(`\n管理员角色当前权限：${adminRole.permissions.length} 个`)
  adminRole.permissions.forEach((rp) => {
    console.log(`  - ${rp.permission.code}`)
  })

  // 检查是否有权限缺失
  const currentPermCodes = adminRole.permissions.map((rp) => rp.permissionId)
  const missingPermissions = allPermissions.filter((p) => !currentPermCodes.includes(p.id))

  if (missingPermissions.length > 0) {
    console.log(`\n发现 ${missingPermissions.length} 个缺失权限，正在分配...`)

    for (const perm of missingPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      })
      console.log(`  ✓ 分配权限：${perm.code}`)
    }

    console.log('\n✓ 权限分配完成')
  } else {
    console.log('\n✓ 管理员已拥有所有权限')
  }

  // 获取所有用户
  const users = await prisma.sysUser.findMany({
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })

  console.log('\n=== 用户权限详情 ===')
  for (const user of users) {
    console.log(`\n用户：${user.username} (${user.realName})`)
    console.log(`  角色：${user.roles.map((ur) => ur.role.name).join(', ') || '无'}`)

    const permissions = new Set<string>()
    for (const userRole of user.roles) {
      for (const rolePerm of userRole.role.permissions) {
        permissions.add(rolePerm.permission.code)
      }
    }

    console.log(`  权限代码 (${permissions.size}个): ${Array.from(permissions).join(', ') || '无'}`)
  }

  await prisma.$disconnect()
}

fixUserPermissions().catch((err) => {
  console.error('执行失败:', err)
  process.exit(1)
})
