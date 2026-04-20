/**
 * KMS 密钥初始化脚本
 */

import { prisma } from '@/lib/prisma'
import { generateKey, activateKey } from '@/lib/kms'

/**
 * 初始化 KMS 密钥
 */
export async function initKmsKeys() {
  console.log('初始化 KMS 密钥...')

  const keyTypes: Array<'MASTER_KEY' | 'SM4_DATA' | 'SM2_SIGN' | 'JWT_SECRET'> = [
    'MASTER_KEY',
    'SM4_DATA',
    'SM2_SIGN',
    'JWT_SECRET',
  ]

  for (const keyType of keyTypes) {
    // 检查是否已有活跃密钥
    const existing = await prisma.sysKeyVersion.findFirst({
      where: {
        keyType,
        isActive: true,
      },
    })

    if (existing) {
      console.log(`  密钥 ${keyType} 已存在，跳过`)
      continue
    }

    // 生成新密钥
    const keyValue = generateKey(keyType)
    const encryptedValue =
      keyType === 'MASTER_KEY' ? require('@/lib/gm-crypto').sm3Hash(keyValue) : keyValue // 其他密钥由 createKeyRecord 加密

    // 创建密钥记录
    const record = await prisma.sysKeyVersion.create({
      data: {
        keyType,
        version: 1,
        keyData: encryptedValue,
        isActive: false,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 年后过期
        createdBy: 'system',
      },
    })

    // 激活密钥
    await activateKey(record.id)

    console.log(`  ✓ 初始化密钥：${keyType}`)
  }

  console.log('KMS 密钥初始化完成!\n')
}

if (require.main === module) {
  initKmsKeys()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('KMS 初始化失败:', error)
      process.exit(1)
    })
}
