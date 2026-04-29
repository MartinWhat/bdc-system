/**
 * 重置测试用户密码脚本
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'

async function resetPasswords() {
  console.log('🔄 重置测试用户密码...\n')

  const users = [
    { username: 'admin', password: 'admin123' },
    { username: 'operator', password: 'password123' },
    { username: 'viewer', password: 'password123' },
  ]

  for (const { username, password } of users) {
    const user = await prisma.sysUser.findUnique({
      where: { username },
    })

    if (!user) {
      console.log(`⚠️  用户 ${username} 不存在，跳过`)
      continue
    }

    const passwordHash = await hashUserPassword(password)

    await prisma.sysUser.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    console.log(`✅ ${username} / ${password}`)
  }

  console.log('\n✅ 密码重置完成！\n')
}

resetPasswords()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
