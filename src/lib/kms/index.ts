/**
 * LocalKMS - 本地密钥管理系统
 * 负责密钥的生成、存储、轮换和访问审计
 */

import { prisma } from '@/lib/prisma'
import { sm3Hash, sm4Encrypt, sm4Decrypt, generateSalt, generateSM4Key } from '@/lib/gm-crypto'

export type KeyType = 'MASTER_KEY' | 'SM4_DATA' | 'SM2_SIGN' | 'JWT_SECRET'

export interface KeyRecord {
  id: string
  keyType: KeyType
  version: number
  keyValue: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  createdBy: string
}

/**
 * 密钥轮换周期配置（天）
 */
export const KEY_ROTATION_DAYS: Record<KeyType, number> = {
  MASTER_KEY: 365,
  SM4_DATA: 90,
  SM2_SIGN: 365,
  JWT_SECRET: 30,
}

/**
 * 密钥缓存配置
 */
const KEY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟缓存
const keyCache: Map<KeyType, { key: KeyRecord; expiresAt: number }> = new Map()

/**
 * 清除密钥缓存
 * @param keyType - 可选，指定清除某类型密钥，不指定则清除全部
 */
export function clearKeyCache(keyType?: KeyType): void {
  if (keyType) {
    keyCache.delete(keyType)
  } else {
    keyCache.clear()
  }
}

/**
 * 生成新密钥
 * @param keyType - 密钥类型
 * @returns 明文密钥
 */
export function generateKey(keyType: KeyType): string {
  switch (keyType) {
    case 'MASTER_KEY':
      return generateMasterKey()
    case 'SM4_DATA':
      return generateSM4Key()
    case 'SM2_SIGN':
      return generateSalt(32) // SM2 私钥占位
    case 'JWT_SECRET':
      return generateSalt(32)
    default:
      throw new Error(`不支持的密钥类型：${keyType}`)
  }
}

/**
 * 生成主密钥（用于加密其他密钥）
 */
function generateMasterKey(): string {
  return generateSalt(32)
}

/**
 * 获取主密钥（用于加密其他密钥）
 * 注意：MASTER_KEY 本身使用 SM3 哈希存储（不可逆），
 * 但用于 SM3-HMAC 生成查询索引时只需要单向哈希
 */

/**
 * 获取回退密钥（用于解密）
 * 优先级：环境变量 > 数据库主密钥
 */
async function getFallbackKey(): Promise<string> {
  // 优先使用环境变量配置的回退密钥（明文）
  if (process.env.KMS_FALLBACK_KEY) {
    return process.env.KMS_FALLBACK_KEY
  }

  throw new Error('KMS_FALLBACK_KEY 环境变量未配置')
}

/**
 * 使用主密钥加密密钥值
 * @param keyValue - 明文密钥值
 * @returns 加密后的密钥值
 */
async function encryptKeyValue(keyType: KeyType, keyValue: string): Promise<string> {
  // MASTER_KEY 使用 SM3 哈希（单向，不可逆）
  if (keyType === 'MASTER_KEY') {
    return sm3Hash(keyValue)
  }

  // 其他密钥类型使用 SM4 加密（可逆）
  const fallbackKey = await getFallbackKey()
  const iv = generateSalt(16)
  const encrypted = sm4Encrypt(keyValue, fallbackKey, iv)
  return `${iv}:${encrypted.ciphertext}`
}

/**
 * 解密密钥值
 * @param encryptedValue - 加密后的密钥值
 * @returns 明文密钥值
 */
async function decryptKeyValue(keyType: KeyType, encryptedValue: string): Promise<string> {
  // MASTER_KEY 是单向哈希，无法解密
  if (keyType === 'MASTER_KEY') {
    throw new Error('MASTER_KEY 是单向哈希，无法解密')
  }

  const [iv, ciphertext] = encryptedValue.split(':')

  // 使用回退密钥解密
  const fallbackKey = await getFallbackKey()

  try {
    return sm4Decrypt(ciphertext, fallbackKey, iv)
  } catch (error) {
    console.error('Decrypt key error for', keyType, ':', error)
    throw new Error('密钥解密失败')
  }
}

/**
 * 创建新密钥记录
 * @param keyType - 密钥类型
 * @param createdBy - 创建人 ID
 * @param expiresAt - 过期时间（可选）
 * @returns 密钥记录
 */
export async function createKeyRecord(
  keyType: KeyType,
  createdBy: string,
  expiresAt?: Date,
): Promise<KeyRecord> {
  const keyValue = generateKey(keyType)

  // 计算默认过期时间
  const defaultExpiresAt = expiresAt || new Date()
  if (!expiresAt) {
    const days = KEY_ROTATION_DAYS[keyType]
    defaultExpiresAt.setDate(defaultExpiresAt.getDate() + days)
  }

  // 使用 SM4 加密存储密钥值（MASTER_KEY 使用 SM3 哈希）
  const encryptedValue = await encryptKeyValue(keyType, keyValue)

  const record = await prisma.sysKeyVersion.create({
    data: {
      keyType,
      version: await getNextVersion(keyType),
      keyValue: encryptedValue,
      isActive: false,
      expiresAt: defaultExpiresAt,
      createdBy,
    },
  })

  return record as unknown as KeyRecord
}

/**
 * 激活密钥（同时停用同类型的旧密钥）
 * @param keyId - 密钥记录 ID
 */
export async function activateKey(keyId: string): Promise<void> {
  const keyRecord = await prisma.sysKeyVersion.findUnique({
    where: { id: keyId },
  })

  if (!keyRecord) {
    throw new Error('密钥记录不存在')
  }

  // 停用同类型的其他密钥
  await prisma.sysKeyVersion.updateMany({
    where: {
      keyType: keyRecord.keyType,
      id: { not: keyId },
    },
    data: { isActive: false },
  })

  // 激活当前密钥
  await prisma.sysKeyVersion.update({
    where: { id: keyId },
    data: { isActive: true },
  })

  // 清除该类型密钥的缓存
  clearKeyCache(keyRecord.keyType as KeyType)
}

/**
 * 获取当前活跃的密钥（带缓存）
 * @param keyType - 密钥类型
 * @param useCache - 是否使用缓存，默认 true
 * @returns 密钥记录（包含解密的 keyValue）
 */
export async function getActiveKey(keyType: KeyType, useCache = true): Promise<KeyRecord> {
  // 检查缓存
  if (useCache) {
    const cached = keyCache.get(keyType)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key
    }
  }

  const keyRecord = await prisma.sysKeyVersion.findFirst({
    where: {
      keyType,
      isActive: true,
    },
    orderBy: { version: 'desc' },
  })

  if (!keyRecord) {
    throw new Error(`未找到活跃的 ${keyType} 密钥`)
  }

  // 解密密钥值（MASTER_KEY 保持哈希形式）
  const decryptedKeyValue =
    keyType === 'MASTER_KEY'
      ? keyRecord.keyValue
      : await decryptKeyValue(keyType, keyRecord.keyValue)

  const result = {
    ...keyRecord,
    keyValue: decryptedKeyValue,
  } as unknown as KeyRecord

  // 更新缓存
  if (useCache) {
    keyCache.set(keyType, {
      key: result,
      expiresAt: Date.now() + KEY_CACHE_TTL_MS,
    })
  }

  return result
}

/**
 * 轮换密钥
 * @param keyType - 密钥类型
 * @param createdBy - 创建人 ID
 * @returns 新密钥记录
 */
export async function rotateKey(keyType: KeyType, createdBy: string): Promise<KeyRecord> {
  // 创建新密钥
  const newKey = await createKeyRecord(keyType, createdBy)

  // 激活新密钥
  await activateKey(newKey.id)

  return newKey
}

/**
 * 获取下一个版本号
 */
async function getNextVersion(keyType: KeyType): Promise<number> {
  const maxVersion = await prisma.sysKeyVersion.aggregate({
    where: { keyType },
    _max: { version: true },
  })

  return (maxVersion._max.version || 0) + 1
}

/**
 * 检查密钥是否过期
 * @param keyRecord - 密钥记录
 * @returns 是否过期
 */
export function isKeyExpired(keyRecord: KeyRecord): boolean {
  return new Date() > keyRecord.expiresAt
}

/**
 * 获取所有过期的密钥
 */
export async function getExpiredKeys(): Promise<KeyRecord[]> {
  const keys = await prisma.sysKeyVersion.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
    orderBy: { expiresAt: 'asc' },
  })

  return keys as unknown as KeyRecord[]
}

/**
 * 密钥访问审计日志
 */
export async function logKeyAccess(keyId: string, userId: string, action: string): Promise<void> {
  // 记录密钥访问日志到操作日志表
  await prisma.operationLog.create({
    data: {
      userId,
      action: `KEY_${action}`,
      module: 'KMS',
      description: `密钥访问：${keyId}`,
      status: 'SUCCESS',
    },
  })
}
