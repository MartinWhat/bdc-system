/**
 * 测试辅助函数 - Mock 密钥管理
 */

import { prisma } from '@/lib/prisma'
import { generateSM4Key, generateSalt, sm4Encrypt } from '@/lib/gm-crypto'
import { type KeyType } from '@/lib/kms'

const TEST_FALLBACK_KEY = '0123456789abcdef0123456789abcdef'

/**
 * 为测试创建初始密钥
 * 使用与 getActiveKey 中 fallback 相同的密钥，确保测试可以正常运行
 */
export async function seedTestKeys() {
  const keyTypes: KeyType[] = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']

  for (const keyType of keyTypes) {
    const existing = await prisma.sysKeyVersion.findFirst({
      where: { keyType, isActive: true },
    })

    if (!existing) {
      let keyValue: string
      let storedValue: string

      if (keyType === 'MASTER_KEY') {
        // MASTER_KEY 存储为 SM3 哈希（单向）
        keyValue = generateSalt(32)
        storedValue = keyValue // 测试用存储哈希本身
      } else {
        // 其他密钥使用 SM4 加密存储
        keyValue = keyType === 'SM4_DATA' ? generateSM4Key() : generateSalt(32)
        const iv = generateSalt(16)
        const encrypted = sm4Encrypt(keyValue, TEST_FALLBACK_KEY, iv)
        storedValue = `${iv}:${encrypted.ciphertext}`
      }

      await prisma.sysKeyVersion.create({
        data: {
          keyType,
          version: 1,
          keyValue: storedValue,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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
