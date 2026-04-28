/**
 * 敏感数据加密服务
 * 负责身份证号、手机号等敏感字段的自动加密和解密
 */

import { sm4Encrypt, sm4Decrypt, sm3Hmac, generateSM4Key } from '@/lib/gm-crypto'
import { getActiveKey, getDecryptKeys } from '@/lib/kms'

/**
 * 敏感字段配置
 */
export interface SensitiveFieldConfig {
  fieldName: string // 原始字段名
  encryptedFieldName: string // 加密字段名（存储密文）
  hashFieldName: string // 哈希字段名（用于查询索引）
}

/**
 * 预定义的敏感字段配置
 */
export const SENSITIVE_FIELDS: Record<string, SensitiveFieldConfig> = {
  idCard: {
    fieldName: 'idCard',
    encryptedFieldName: 'idCardEnc',
    hashFieldName: 'idCardHash',
  },
  phone: {
    fieldName: 'phone',
    encryptedFieldName: 'phoneEnc',
    hashFieldName: 'phoneHash',
  },
}

/**
 * 加密上下文 - 缓存密钥以避免重复获取
 */
export interface EncryptionContext {
  sm4Key: string
  masterKey: string
}

/**
 * 创建加密上下文（一次性获取所有需要的密钥）
 * @returns 加密上下文
 */
export async function createEncryptionContext(): Promise<EncryptionContext> {
  const sm4KeyRecord = await getActiveKey('SM4_DATA')
  const masterKeyRecord = await getActiveKey('MASTER_KEY')

  return {
    sm4Key: sm4KeyRecord.keyData,
    masterKey: masterKeyRecord.keyData,
  }
}

/**
 * 使用上下文加密单个字段（避免重复获取密钥）
 * @param plaintext - 明文值
 * @param context - 加密上下文
 * @returns { encrypted: string, hash: string }
 */
export function encryptWithContext(
  plaintext: string,
  context: EncryptionContext,
): { encrypted: string; hash: string } {
  // 生成随机 IV
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  const iv = Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // 加密数据
  const ciphertext = sm4Encrypt(plaintext, context.sm4Key, iv).ciphertext

  // 生成哈希索引（用于查询）
  const hash = sm3Hmac(plaintext, context.masterKey)

  return { encrypted: `${iv}:${ciphertext}`, hash }
}

/**
 * 加密敏感字段
 * @param plaintext - 明文值
 * @returns { encrypted: string, hash: string }
 */
export async function encryptSensitiveField(
  plaintext: string,
): Promise<{ encrypted: string; hash: string }> {
  // 获取 SM4 数据加密密钥
  const sm4KeyRecord = await getActiveKey('SM4_DATA')

  // 生成随机 IV
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  const iv = Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // 加密数据
  const ciphertext = sm4Encrypt(plaintext, sm4KeyRecord.keyData, iv).ciphertext

  // 获取主密钥用于生成哈希索引
  const masterKeyRecord = await getActiveKey('MASTER_KEY')

  // 生成哈希索引（用于查询）
  const hash = sm3Hmac(plaintext, masterKeyRecord.keyData)

  return { encrypted: `${iv}:${ciphertext}`, hash }
}

/**
 * 批量加密敏感字段（性能优化版本）
 * @param plaintexts - 明文值数组
 * @returns 加密结果数组
 */
export async function encryptSensitiveFields(
  plaintexts: string[],
): Promise<Array<{ encrypted: string; hash: string }>> {
  // 一次性获取密钥
  const context = await createEncryptionContext()

  // 批量加密
  return plaintexts.map((plaintext) => encryptWithContext(plaintext, context))
}

/**
 * 批量加密多条记录的敏感字段
 * @param records - 记录数组，每条记录包含要加密的字段
 * @param fields - 要加密的字段名数组
 * @returns 加密后的记录数组
 */
export async function encryptRecordsFields<T extends Record<string, string | undefined>>(
  records: T[],
  fields: string[],
): Promise<Array<T & Record<string, { encrypted: string; hash: string }>>> {
  // 一次性获取密钥
  const context = await createEncryptionContext()

  // 批量处理每条记录
  return records.map((record) => {
    const encryptedFields: Record<string, { encrypted: string; hash: string }> = {}

    for (const field of fields) {
      const value = record[field]
      if (value) {
        encryptedFields[field] = encryptWithContext(value, context)
      }
    }

    return { ...record, ...encryptedFields } as T &
      Record<string, { encrypted: string; hash: string }>
  })
}

/**
 * 解密敏感字段（支持多密钥尝试）
 * @param encrypted - 加密值（格式：iv:ciphertext）
 * @returns 明文值
 */
export async function decryptSensitiveField(encrypted: string): Promise<string> {
  const [iv, ciphertext] = encrypted.split(':')

  // 获取所有可用于解密的密钥（活跃 + 未过期的历史密钥）
  const decryptKeys = await getDecryptKeys('SM4_DATA')

  // 依次尝试每个密钥
  for (const keyRecord of decryptKeys) {
    try {
      const plaintext = sm4Decrypt(ciphertext, keyRecord.keyData, iv)
      return plaintext
    } catch (error) {
      // 解密失败，尝试下一个密钥
      continue
    }
  }

  // 所有密钥都失败，抛出错误
  throw new Error('所有密钥解密失败，数据可能已损坏或密钥已丢失')
}

/**
 * 批量解密敏感字段
 * @param encryptedValues - 加密值数组
 * @returns 明文值数组
 */
export async function decryptSensitiveFields(encryptedValues: string[]): Promise<string[]> {
  // 获取所有可用于解密的密钥
  const decryptKeys = await getDecryptKeys('SM4_DATA')

  // 批量解密
  return encryptedValues.map((encrypted) => {
    const [iv, ciphertext] = encrypted.split(':')

    // 依次尝试每个密钥
    for (const keyRecord of decryptKeys) {
      try {
        return sm4Decrypt(ciphertext, keyRecord.keyData, iv)
      } catch (error) {
        continue
      }
    }

    throw new Error('所有密钥解密失败')
  })
}

/**
 * 解密记录中的敏感字段
 * @param record - 记录对象
 * @param fields - 要解密的字段名数组
 * @returns 解密后的记录对象
 */
export async function decryptRecordsFields<T extends Record<string, string | undefined>>(
  record: T,
  fields: string[],
): Promise<T> {
  const decrypted: Record<string, string> = {}

  for (const field of fields) {
    const encryptedValue = record[field]
    if (encryptedValue) {
      try {
        decrypted[field] = await decryptSensitiveField(encryptedValue)
      } catch (error) {
        console.error(`Failed to decrypt field ${field}:`, error)
        decrypted[field] = '[解密失败]'
      }
    }
  }

  return { ...record, ...decrypted } as T
}

/**
 * 生成查询哈希（用于加密字段查询）
 * @param value - 敏感值
 * @param masterKey - 主密钥
 * @returns 哈希值
 */
export function generateQueryHash(value: string, masterKey: string): string {
  return sm3Hmac(value, masterKey)
}

/**
 * 加密中间件（用于批量加密）
 * @param records - 记录数组
 * @param fields - 要加密的字段
 * @returns 加密后的记录数组
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEncryptionMiddleware<T extends Record<string, any>>(
  records: T[],
  fields: string[],
): Promise<T[]> {
  return encryptRecordsFields(records, fields) as Promise<T[]>
}
