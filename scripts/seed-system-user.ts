/**
 * 创建 system 用户（用于系统操作日志）
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'

async function createSystemUser() {
  console.log('📝 创建 system 用户...\n')

  const existing = await prisma.sysUser.findUnique({
    where: { username: 'system' },
  })

  if (existing) {
    console.log('✅ system 用户已存在')
    return
  }

  const { passwordHash, salt } = hashUserPassword('system-password-not-for-login')

  await prisma.sysUser.create({
    data: {
      username: 'system',
      passwordHash,
      salt,
      realName: '系统用户',
      createdBy: 'system',
    },
  })

  console.log('✅ system 用户创建成功')
}

createSystemUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
