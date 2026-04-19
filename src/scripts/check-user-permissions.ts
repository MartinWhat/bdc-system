/**
 * 检查用户权限
 */

import { prisma } from '@/lib/prisma'

async function checkUserPermissions() {
  console.log('=== 用户权限检查 ===\n')

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

  for (const user of users) {
    console.log(`用户：${user.username} (${user.realName})`)
    console.log(`  角色：${user.roles.map((ur) => ur.role.name).join(', ') || '无'}`)

    const permissions = new Set<string>()
    for (const userRole of user.roles) {
      for (const rolePerm of userRole.role.permissions) {
        permissions.add(rolePerm.permission.code)
      }
    }

    console.log(`  权限代码：${Array.from(permissions).join(', ') || '无'}`)
    console.log()
  }

  // 获取所有权限
  const allPermissions = await prisma.sysPermission.findMany()
  console.log(`\n系统共有 ${allPermissions.length} 个权限：`)
  allPermissions.forEach((p) => {
    console.log(`  - ${p.code} (${p.name})`)
  })

  await prisma.$disconnect()
}

checkUserPermissions().catch((err) => {
  console.error('检查失败:', err)
  process.exit(1)
})
