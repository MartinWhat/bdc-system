/**
 * 敏感数据加密服务
 * 负责身份证号、手机号等敏感字段的自动加密和解密
 */

import { sm4Encrypt, sm4Decrypt, sm3Hmac, generateSM4Key } from '@/lib/gm-crypto'
import { getActiveKey } from '@/lib/kms'

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
  const ciphertext = sm4Encrypt(plaintext, sm4KeyRecord.keyValue, iv).ciphertext

  // 获取主密钥用于生成哈希索引
  const masterKeyRecord = await getActiveKey('MASTER_KEY')

  // 生成哈希索引（用于查询）
  const hash = sm3Hmac(plaintext, masterKeyRecord.keyValue)

  return { encrypted: `${iv}:${ciphertext}`, hash }
}

/**
 * 解密敏感字段
 * @param encrypted - 加密值（格式: iv:ciphertext）
 * @returns 明文值
 */
export async function decryptSensitiveField(encrypted: string): Promise<string> {
  const [iv, ciphertext] = encrypted.split(':')

  // 获取 SM4 数据加密密钥
  const sm4KeyRecord = await getActiveKey('SM4_DATA')

  return sm4Decrypt(ciphertext, sm4KeyRecord.keyValue, iv)
}

/**
 * 生成查询哈希
 * @param value - 查询值
 * @returns 哈希索引
 */
export async function generateQueryHash(value: string): Promise<string> {
  const masterKeyRecord = await getActiveKey('MASTER_KEY')
  return sm3Hmac(value, masterKeyRecord.keyValue)
}

/**
 * 数据加密中间件函数类型
 */
export interface EncryptionMiddleware {
  encrypt: (data: Record<string, unknown>) => Promise<Record<string, unknown>>
  decrypt: (data: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/**
 * 创建加密中间件
 * @param fields - 需要加密的字段配置
 */
export function createEncryptionMiddleware(fields: SensitiveFieldConfig[]): EncryptionMiddleware {
  return {
    async encrypt(data) {
      const encrypted = { ...data }

      for (const config of fields) {
        const value = data[config.fieldName] as string
        if (value) {
          const { encrypted: encValue, hash } = await encryptSensitiveField(value)
          encrypted[config.encryptedFieldName] = encValue
          encrypted[config.hashFieldName] = hash
          delete encrypted[config.fieldName] // 移除明文字段
        }
      }

      return encrypted
    },

    async decrypt(data) {
      const decrypted = { ...data }

      for (const config of fields) {
        const encryptedValue = data[config.encryptedFieldName] as string
        if (encryptedValue) {
          decrypted[config.fieldName] = await decryptSensitiveField(encryptedValue)
          delete decrypted[config.encryptedFieldName] // 移除加密字段
        }
      }

      return decrypted
    },
  }
}
