/**
 * 检查 KMS 密钥状态
 */

import { prisma } from '@/lib/prisma'

async function checkKeys() {
  console.log('=== KMS 密钥状态检查 ===\n')

  const keys = await prisma.sysKeyVersion.findMany({
    orderBy: [{ keyType: 'asc' }, { version: 'desc' }],
  })

  const keyTypes = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']

  for (const keyType of keyTypes) {
    const typeKeys = keys.filter((k) => k.keyType === keyType)
    const activeKey = typeKeys.find((k) => k.isActive)

    console.log(`${keyType}:`)
    console.log(`  总版本数：${typeKeys.length}`)
    console.log(
      `  活跃密钥：${activeKey ? `v${activeKey.version} (创建于 ${activeKey.createdAt})` : '❌ 无'}`,
    )
    console.log()
  }

  await prisma.$disconnect()
}

checkKeys().catch((err) => {
  console.error('检查失败:', err)
  process.exit(1)
})
