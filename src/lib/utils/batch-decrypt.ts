/**
 * 批量解密工具函数
 * 用于 API 路由中批量解密 SM4 加密的敏感字段并进行脱敏处理
 */

import { sm4Decrypt } from '@/lib/gm-crypto'
import { getActiveKey } from '@/lib/kms'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'

/**
 * 解密字段配置
 */
export interface DecryptFieldConfig {
  /** 字段名 */
  field: string
  /** 脱敏类型 */
  maskType: 'idCard' | 'phone' | 'none'
}

/**
 * 批量解密并脱敏记录
 * @param records - 需要处理的记录数组
 * @param fields - 需要解密和脱敏的字段配置
 * @returns 处理后的记录数组（字段已解密和脱敏）
 */
export async function decryptAndMaskRecords(
  records: Record<string, unknown>[],
  fields: DecryptFieldConfig[],
): Promise<Record<string, unknown>[]> {
  if (records.length === 0 || fields.length === 0) {
    return records
  }

  // 收集所有需要解密的值
  const valuesToDecrypt: Map<string, Map<string, string>> = new Map()

  for (const config of fields) {
    const encryptedValues: Map<string, string> = new Map()
    for (const record of records) {
      const value = record[config.field]
      if (value && typeof value === 'string') {
        encryptedValues.set(value, value)
      }
    }
    valuesToDecrypt.set(config.field, encryptedValues)
  }

  // 如果没有需要解密的值，直接返回
  const totalValues = Array.from(valuesToDecrypt.values()).reduce((sum, map) => sum + map.size, 0)
  if (totalValues === 0) {
    return records
  }

  // 一次性获取密钥
  const sm4KeyRecord = await getActiveKey('SM4_DATA')
  const sm4Key = sm4KeyRecord.keyData

  // 批量解密并创建映射
  const decryptedMaps: Map<string, Map<string, string>> = new Map()

  for (const config of fields) {
    const encryptedMap = valuesToDecrypt.get(config.field)!
    const decryptedMap: Map<string, string> = new Map()

    for (const encrypted of encryptedMap.keys()) {
      try {
        const [iv, ciphertext] = encrypted.split(':')
        const decrypted = sm4Decrypt(ciphertext, sm4Key, iv)

        // 根据脱敏类型进行处理
        switch (config.maskType) {
          case 'idCard':
            decryptedMap.set(encrypted, maskIdCard(decrypted))
            break
          case 'phone':
            decryptedMap.set(encrypted, maskPhone(decrypted))
            break
          case 'none':
            decryptedMap.set(encrypted, decrypted)
            break
        }
      } catch (error) {
        console.error(`解密失败: ${config.field} - ${encrypted.substring(0, 20)}...`, error)
        decryptedMap.set(encrypted, '解密失败')
      }
    }

    decryptedMaps.set(config.field, decryptedMap)
  }

  // 映射回原始数据
  return records.map((record) => {
    const result: Record<string, unknown> = { ...record }
    for (const config of fields) {
      const decryptedMap = decryptedMaps.get(config.field)
      if (decryptedMap && record[config.field]) {
        result[config.field] = decryptedMap.get(record[config.field] as string) || null
      }
    }
    return result
  })
}

/**
 * 批量解密身份证字段并脱敏
 * @param records - 记录数组
 * @param field - 身份证字段名（默认 'idCard'）
 * @returns 处理后的记录数组
 */
export async function decryptIdCards(
  records: Record<string, unknown>[],
  field: string = 'idCard',
): Promise<Record<string, unknown>[]> {
  return decryptAndMaskRecords(records, [{ field, maskType: 'idCard' }])
}

/**
 * 批量解密手机号字段并脱敏
 * @param records - 记录数组
 * @param field - 手机号字段名（默认 'phone'）
 * @returns 处理后的记录数组
 */
export async function decryptPhones(
  records: Record<string, unknown>[],
  field: string = 'phone',
): Promise<Record<string, unknown>[]> {
  return decryptAndMaskRecords(records, [{ field, maskType: 'phone' }])
}
