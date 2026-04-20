/**
 * 创建测试用户脚本
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'

async function createTestUsers() {
  console.log('📝 创建测试用户...\n')

  const users = [
    { username: 'admin', password: 'admin123', realName: '系统管理员' },
    { username: 'operator', password: 'password123', realName: '操作员' },
    { username: 'viewer', password: 'password123', realName: '查看员' },
  ]

  for (const { username, password, realName } of users) {
    const existing = await prisma.sysUser.findUnique({
      where: { username },
    })

    if (existing) {
      console.log(`⚠️  用户 ${username} 已存在，跳过`)
      continue
    }

    const { passwordHash, salt } = await hashUserPassword(password)

    await prisma.sysUser.create({
      data: {
        username,
        passwordHash,
        salt,
        realName,
        createdBy: 'system',
      },
    })

    console.log(`✅ ${username} / ${password} (${realName})`)
  }

  console.log('\n✅ 测试用户创建完成！\n')
}

createTestUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
