/**
 * 密钥初始化脚本
 * 用于首次部署时生成系统所需的初始密钥
 */

import { createKeyRecord, activateKey, type KeyType } from '@/lib/kms'

const KEY_TYPES: KeyType[] = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']

/**
 * 初始化所有密钥
 * @param createdBy - 创建人ID（系统初始化为 "system"）
 */
export async function initializeKeys(createdBy: string = 'system') {
  console.log('开始初始化系统密钥...')

  for (const keyType of KEY_TYPES) {
    try {
      // 检查是否已有活跃密钥
      const { prisma } = await import('@/lib/prisma')
      const existingKey = await prisma.sysKeyVersion.findFirst({
        where: {
          keyType,
          isActive: true,
        },
      })

      if (existingKey) {
        console.log(`✓ ${keyType} 已存在活跃密钥，跳过`)
        continue
      }

      // 创建并激活新密钥
      const keyRecord = await createKeyRecord(keyType, createdBy)
      await activateKey(keyRecord.id)

      console.log(`✓ ${keyType} 密钥已创建并激活 (版本 ${keyRecord.version})`)
    } catch (error) {
      console.error(`✗ ${keyType} 密钥创建失败:`, error)
    }
  }

  console.log('系统密钥初始化完成！')
}

// 如果直接运行此脚本
if (require.main === module) {
  initializeKeys()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('密钥初始化失败:', error)
      process.exit(1)
    })
}
