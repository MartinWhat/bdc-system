/**
 * LocalKMS - 本地密钥管理系统
 * 负责密钥的生成、存储、轮换和访问审计
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  sm4Encrypt,
  sm4Decrypt,
  generateSalt,
  generateSM4Key,
  sm3Hmac,
  createEncryptionContext,
  encryptWithContext,
} from '@/lib/gm-crypto'

export type KeyType = 'MASTER_KEY' | 'SM4_DATA' | 'SM2_SIGN' | 'JWT_SECRET'

export interface KeyRecord {
  id: string
  keyType: KeyType
  version: number
  keyData: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  createdBy?: string

  // 密钥元数据（密钥轮换增强）
  encryptedDataCount?: number
  migratedToKeyId?: string
  isArchived?: boolean
  archivedAt?: Date
  deletedAt?: Date
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
 * 防止缓存击穿：正在进行的密钥查询 promise
 */
const pendingPromises: Map<KeyType, Promise<KeyRecord>> = new Map()

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
  // 使用回退密钥加密所有密钥类型（包括 MASTER_KEY），确保可解密
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
  // 所有密钥类型统一使用回退密钥解密
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

  // 使用 SM4 加密存储密钥值
  const encryptedValue = await encryptKeyValue(keyType, keyValue)

  const record = await prisma.sysKeyVersion.create({
    data: {
      keyType,
      version: await getNextVersion(keyType),
      keyData: encryptedValue,
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
 * 获取当前活跃的密钥（带缓存，防止缓存击穿）
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

  // 如果已有相同类型的请求在进行中，等待其结果（防止缓存击穿）
  if (pendingPromises.has(keyType)) {
    return pendingPromises.get(keyType)!
  }

  // 创建新的查询 promise
  const promise = (async () => {
    try {
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

      // 解密密钥值（所有密钥类型统一解密）
      const decryptedKeyValue = await decryptKeyValue(keyType, keyRecord.keyData)

      const result = {
        ...keyRecord,
        keyData: decryptedKeyValue,
      } as unknown as KeyRecord

      // 更新缓存
      if (useCache) {
        keyCache.set(keyType, {
          key: result,
          expiresAt: Date.now() + KEY_CACHE_TTL_MS,
        })
      }

      return result
    } finally {
      // 查询完成后移除 pending promise
      pendingPromises.delete(keyType)
    }
  })()

  pendingPromises.set(keyType, promise)
  return promise
}

/**
 * 轮换密钥（自动重加密已有数据，符合 NIST SP 800-57 要求）
 * @param keyType - 密钥类型
 * @param createdBy - 创建人 ID
 * @returns 新密钥记录
 */
export async function rotateKey(keyType: KeyType, createdBy: string): Promise<KeyRecord> {
  // 获取旧密钥（用于重加密）
  const oldKey = await getActiveKey(keyType)

  // 创建新密钥
  const newKey = await createKeyRecord(keyType, createdBy)

  // 激活新密钥
  await activateKey(newKey.id)

  // 重加密已有数据（SM4_DATA 和 MASTER_KEY 需要重加密）
  if (keyType === 'SM4_DATA' || keyType === 'MASTER_KEY') {
    try {
      await reEncryptAllData(keyType, oldKey, newKey)
    } catch (error) {
      console.error(`Re-encryption failed for ${keyType}:`, error)
      // 重加密失败不影响密钥轮换，但应记录警告
    }
  }

  return newKey
}

/**
 * 重加密所有使用指定密钥类型的数据
 * 用于密钥轮换后重新加密已有数据，符合 NIST SP 800-57 合规要求
 * @param keyType - 密钥类型
 * @param oldKey - 旧密钥
 * @param newKey - 新密钥
 */
async function reEncryptAllData(
  keyType: KeyType,
  oldKey: KeyRecord,
  newKey: KeyRecord,
): Promise<void> {
  const oldContext = {
    sm4Key: keyType === 'MASTER_KEY' ? (await getActiveKey('SM4_DATA')).keyData : oldKey.keyData,
    masterKey: keyType === 'SM4_DATA' ? (await getActiveKey('MASTER_KEY')).keyData : oldKey.keyData,
  }
  const newContext = {
    sm4Key: keyType === 'MASTER_KEY' ? (await getActiveKey('SM4_DATA')).keyData : newKey.keyData,
    masterKey: keyType === 'SM4_DATA' ? (await getActiveKey('MASTER_KEY')).keyData : newKey.keyData,
  }

  if (keyType === 'SM4_DATA') {
    // SM4_DATA 轮换：重加密所有加密字段
    await reEncryptSM4Data(oldKey, newKey)
  } else if (keyType === 'MASTER_KEY') {
    // MASTER_KEY 轮换：重新生成所有哈希索引
    await reEncryptMasterKeyData(oldKey, newKey)
  }
}

/**
 * 重加密 SM4_DATA 密钥加密的数据
 * 使用批量更新 + 并发控制优化性能
 */
async function reEncryptSM4Data(oldKey: KeyRecord, newKey: KeyRecord): Promise<void> {
  // 重新获取上下文（确保使用正确的密钥）
  const oldCtx = { sm4Key: oldKey.keyData, masterKey: (await getActiveKey('MASTER_KEY')).keyData }
  const newCtx = { sm4Key: newKey.keyData, masterKey: (await getActiveKey('MASTER_KEY')).keyData }

  // 批量查询 SysUser 加密记录
  const sysUsers = await prisma.sysUser.findMany({
    where: { idCard: { contains: ':' } },
    select: { id: true, idCard: true, phone: true },
  })

  // 批量查询 ZjdReceiveRecord 加密记录
  const receiveRecords = await prisma.zjdReceiveRecord.findMany({
    where: { receiverIdCard: { contains: ':' } },
    select: { id: true, receiverIdCard: true, receiverPhone: true },
  })

  // 并发控制：每批处理 50 条记录
  const BATCH_SIZE = 50

  // 批量更新 SysUser
  const sysUserUpdates = sysUsers.map((record) => {
    const updateData: Record<string, string> = {}
    if (record.idCard) {
      const { encrypted, hash } = reEncryptField(record.idCard, oldCtx.sm4Key, newCtx)
      updateData.idCard = encrypted
      updateData.idCardHash = hash
    }
    if (record.phone && record.phone.includes(':')) {
      const { encrypted, hash } = reEncryptField(record.phone, oldCtx.sm4Key, newCtx)
      updateData.phone = encrypted
      updateData.phoneHash = hash
    }
    return { id: record.id, data: updateData }
  })

  // 分批执行更新
  for (let i = 0; i < sysUserUpdates.length; i += BATCH_SIZE) {
    const batch = sysUserUpdates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((update) =>
        prisma.sysUser.update({ where: { id: update.id }, data: update.data }).catch((error) => {
          console.error(`Failed to re-encrypt SysUser ${update.id}:`, error)
        }),
      ),
    )
  }

  // 批量更新 ZjdReceiveRecord
  const receiveUpdates = receiveRecords.map((record) => {
    const updateData: Record<string, string> = {}
    if (record.receiverIdCard) {
      const { encrypted, hash } = reEncryptField(record.receiverIdCard, oldCtx.sm4Key, newCtx)
      updateData.receiverIdCard = encrypted
      updateData.receiverIdCardHash = hash
    }
    if (record.receiverPhone && record.receiverPhone.includes(':')) {
      const { encrypted, hash } = reEncryptField(record.receiverPhone, oldCtx.sm4Key, newCtx)
      updateData.receiverPhone = encrypted
      updateData.receiverPhoneHash = hash
    }
    return { id: record.id, data: updateData }
  })

  // 分批执行更新
  for (let i = 0; i < receiveUpdates.length; i += BATCH_SIZE) {
    const batch = receiveUpdates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((update) =>
        prisma.zjdReceiveRecord
          .update({ where: { id: update.id }, data: update.data })
          .catch((error) => {
            console.error(`Failed to re-encrypt ZjdReceiveRecord ${update.id}:`, error)
          }),
      ),
    )
  }
}

/**
 * 重新生成 MASTER_KEY 哈希索引的数据
 * 使用批量更新 + 并发控制优化性能
 */
async function reEncryptMasterKeyData(oldKey: KeyRecord, newKey: KeyRecord): Promise<void> {
  const oldCtx = { sm4Key: (await getActiveKey('SM4_DATA')).keyData, masterKey: oldKey.keyData }
  const newCtx = { sm4Key: (await getActiveKey('SM4_DATA')).keyData, masterKey: newKey.keyData }

  // 并发控制：每批处理 50 条记录
  const BATCH_SIZE = 50

  // SysUser: idCardHash, phoneHash - 批量查询
  const users = await prisma.sysUser.findMany({
    where: {
      OR: [{ idCardHash: { not: null } }, { phoneHash: { not: null } }],
    },
    select: { id: true, idCard: true, phone: true },
  })

  // 批量准备更新数据
  const userUpdates = users.map((user) => {
    const updateData: Record<string, string> = {}
    try {
      if (user.idCard) {
        const [iv, ciphertext] = user.idCard.split(':')
        const plaintext = iv && ciphertext ? sm4Decrypt(ciphertext, oldCtx.sm4Key, iv) : user.idCard
        updateData.idCardHash = sm3Hmac(plaintext, newCtx.masterKey)
      }
      if (user.phone) {
        const [iv, ciphertext] = user.phone.split(':')
        const plaintext = iv && ciphertext ? sm4Decrypt(ciphertext, oldCtx.sm4Key, iv) : user.phone
        updateData.phoneHash = sm3Hmac(plaintext, newCtx.masterKey)
      }
    } catch (error) {
      console.error(`Failed to prepare hash for SysUser ${user.id}:`, error)
    }
    return { id: user.id, data: updateData }
  })

  // 分批执行更新
  for (let i = 0; i < userUpdates.length; i += BATCH_SIZE) {
    const batch = userUpdates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((update) =>
        Object.keys(update.data).length > 0
          ? prisma.sysUser
              .update({ where: { id: update.id }, data: update.data })
              .catch((error) => {
                console.error(`Failed to update SysUser ${update.id}:`, error)
              })
          : Promise.resolve(),
      ),
    )
  }

  // CollectiveCert: 批量查询
  const certs = await prisma.collectiveCert.findMany({
    where: {
      OR: [{ idCardHash: { not: null } }, { phoneHash: { not: null } }],
    },
    select: { id: true, idCard: true, phone: true },
  })

  // 批量准备更新数据
  const certUpdates = certs.map((cert) => {
    const updateData: Record<string, string> = {}
    try {
      if (cert.idCard) {
        const [iv, ciphertext] = cert.idCard.split(':')
        const plaintext = iv && ciphertext ? sm4Decrypt(ciphertext, oldCtx.sm4Key, iv) : cert.idCard
        updateData.idCardHash = sm3Hmac(plaintext, newCtx.masterKey)
      }
      if (cert.phone) {
        const [iv, ciphertext] = cert.phone.split(':')
        const plaintext = iv && ciphertext ? sm4Decrypt(ciphertext, oldCtx.sm4Key, iv) : cert.phone
        updateData.phoneHash = sm3Hmac(plaintext, newCtx.masterKey)
      }
    } catch (error) {
      console.error(`Failed to prepare hash for CollectiveCert ${cert.id}:`, error)
    }
    return { id: cert.id, data: updateData }
  })

  // 分批执行更新
  for (let i = 0; i < certUpdates.length; i += BATCH_SIZE) {
    const batch = certUpdates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((update) =>
        Object.keys(update.data).length > 0
          ? prisma.collectiveCert
              .update({ where: { id: update.id }, data: update.data })
              .catch((error) => {
                console.error(`Failed to update CollectiveCert ${update.id}:`, error)
              })
          : Promise.resolve(),
      ),
    )
  }
}

/**
 * 使用新密钥重新加密单个字段
 */
function reEncryptField(
  encryptedValue: string,
  oldSm4Key: string,
  newContext: { sm4Key: string; masterKey: string },
): { encrypted: string; hash: string } {
  // 解析旧加密值
  const [oldIv, oldCiphertext] = encryptedValue.split(':')
  if (!oldIv || !oldCiphertext) {
    throw new Error('Invalid encrypted value format')
  }

  // 解密
  const plaintext = sm4Decrypt(oldCiphertext, oldSm4Key, oldIv)

  // 使用新密钥和上下文重新加密
  return encryptWithContext(plaintext, newContext)
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

/**
 * 获取某密钥类型的所有历史密钥（按版本排序）
 * @param keyType - 密钥类型
 * @param includeArchived - 是否包含已归档密钥，默认 false
 * @returns 密钥记录数组
 */
export async function getAllKeys(
  keyType: KeyType,
  includeArchived: boolean = false,
): Promise<KeyRecord[]> {
  const where: Prisma.SysKeyVersionWhereInput = {
    keyType,
    deletedAt: null, // 排除已删除的密钥
  }

  if (!includeArchived) {
    where.isArchived = false
  }

  const keys = await prisma.sysKeyVersion.findMany({
    where,
    orderBy: { version: 'desc' },
  })

  // 解密密钥值
  const decryptedKeys: KeyRecord[] = []
  for (const key of keys) {
    try {
      const decryptedKeyValue = await decryptKeyValue(keyType, key.keyData)

      decryptedKeys.push({
        ...key,
        keyData: decryptedKeyValue,
      } as unknown as KeyRecord)
    } catch (error) {
      console.error(`Failed to decrypt key ${key.id}:`, error)
      // 跳过解密失败的密钥
    }
  }

  return decryptedKeys
}

/**
 * 获取用于解密的密钥列表（活跃 + 未过期的历史密钥）
 * @param keyType - 密钥类型
 * @returns 密钥记录数组
 */
export async function getDecryptKeys(keyType: KeyType): Promise<KeyRecord[]> {
  const now = new Date()

  // 获取所有未删除且未过期的密钥（包括活跃的）
  const keys = await prisma.sysKeyVersion.findMany({
    where: {
      keyType,
      deletedAt: null,
      isArchived: false,
      expiresAt: { gte: now }, // 只获取未过期的密钥
    },
    orderBy: { version: 'desc' },
  })

  // 解密密钥值
  const decryptedKeys: KeyRecord[] = []
  for (const key of keys) {
    try {
      const decryptedKeyValue = await decryptKeyValue(keyType, key.keyData)

      decryptedKeys.push({
        ...key,
        keyData: decryptedKeyValue,
      } as unknown as KeyRecord)
    } catch (error) {
      console.error(`Failed to decrypt key ${key.id}:`, error)
      // 跳过解密失败的密钥
    }
  }

  return decryptedKeys
}

/**
 * 标记密钥为已归档
 * @param keyId - 密钥记录 ID
 */
export async function archiveKey(keyId: string): Promise<void> {
  await prisma.sysKeyVersion.update({
    where: { id: keyId },
    data: {
      isArchived: true,
      archivedAt: new Date(),
    },
  })

  // 清除缓存
  clearKeyCache()
}

/**
 * 安全删除密钥（确认数据已迁移）
 * @param keyId - 密钥记录 ID
 * @param force - 是否强制删除（即使还有数据使用），默认 false
 */
export async function deleteKey(keyId: string, force: boolean = false): Promise<void> {
  const keyRecord = await prisma.sysKeyVersion.findUnique({
    where: { id: keyId },
  })

  if (!keyRecord) {
    throw new Error('密钥记录不存在')
  }

  // 检查是否还有数据使用该密钥
  if (!force && keyRecord.encryptedDataCount && keyRecord.encryptedDataCount > 0) {
    throw new Error(`密钥 ${keyId} 仍有 ${keyRecord.encryptedDataCount} 条数据未迁移，无法删除`)
  }

  // 软删除（设置 deletedAt）
  await prisma.sysKeyVersion.update({
    where: { id: keyId },
    data: {
      deletedAt: new Date(),
    },
  })

  // 清除缓存
  clearKeyCache(keyRecord.keyType as KeyType)

  // 记录审计日志
  await logKeyAccess(keyId, 'system', 'DELETE')
}

/**
 * 更新密钥的加密数据计数
 * @param keyId - 密钥记录 ID
 * @param count - 数据数量
 */
export async function updateKeyDataCount(keyId: string, count: number): Promise<void> {
  await prisma.sysKeyVersion.update({
    where: { id: keyId },
    data: {
      encryptedDataCount: count,
    },
  })
}

/**
 * 标记密钥已迁移到目标密钥
 * @param keyId - 源密钥 ID
 * @param targetKeyId - 目标密钥 ID
 */
export async function markKeyAsMigrated(keyId: string, targetKeyId: string): Promise<void> {
  await prisma.sysKeyVersion.update({
    where: { id: keyId },
    data: {
      migratedToKeyId: targetKeyId,
    },
  })
}
