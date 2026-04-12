/**
 * 测试辅助函数 - Mock 密钥管理
 */

import { prisma } from '@/lib/prisma'
import { generateSM4Key, generateSalt } from '@/lib/gm-crypto'

/**
 * 为测试创建初始密钥
 */
export async function seedTestKeys() {
  const keyTypes = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']

  for (const keyType of keyTypes) {
    const existing = await prisma.sysKeyVersion.findFirst({
      where: { keyType, isActive: true },
    })

    if (!existing) {
      let keyValue: string
      if (keyType === 'SM4_DATA') {
        keyValue = generateSM4Key()
      } else {
        keyValue = generateSalt(32)
      }

      await prisma.sysKeyVersion.create({
        data: {
          keyType,
          version: 1,
          keyValue,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1年后
          createdBy: 'test',
        },
      })
    }
  }
}

/**
 * 清理测试数据
 */
export async function clearTestData() {
  await prisma.sysKeyVersion.deleteMany()
}
