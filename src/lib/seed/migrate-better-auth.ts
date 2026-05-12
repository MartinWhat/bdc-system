import { prisma } from '@/lib/prisma'
import { upsertCredentialAccount } from '@/lib/auth/accounts'

/**
 * 将现有 sys_user 数据迁移到 Better Auth 的 credential account 结构。
 * 这只补齐认证所需的数据，不改动旧的 sys_session 历史数据。
 */
export async function migrateToBetterAuth() {
  console.log('=== 开始迁移 Better Auth 数据 ===')

  const users = await prisma.sysUser.findMany({
    select: {
      id: true,
      username: true,
      realName: true,
      displayUsername: true,
      passwordHash: true,
      email: true,
      emailVerified: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  let migrated = 0
  let skipped = 0

  for (const user of users) {
    if (!user.passwordHash) {
      console.warn(`  ⚠ 跳过 ${user.username}：缺少 passwordHash`)
      skipped += 1
      continue
    }

    if (!user.displayUsername) {
      await prisma.sysUser.update({
        where: { id: user.id },
        data: { displayUsername: user.realName },
      })
    }

    if (!user.email) {
      await prisma.sysUser.update({
        where: { id: user.id },
        data: { email: `${user.username}@system.local` },
      })
    }

    await upsertCredentialAccount(user.id, user.passwordHash)
    migrated += 1
    console.log(`  ✓ 已迁移用户：${user.username}`)
  }

  console.log(`\n迁移完成：成功 ${migrated} 个，跳过 ${skipped} 个`)
  console.log('=== Better Auth 数据迁移结束 ===')
}

if (require.main === module) {
  migrateToBetterAuth()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Better Auth 迁移失败:', error)
      process.exit(1)
    })
}
