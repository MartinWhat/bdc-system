/**
 * 批量敏感字段处理工具
 * 当前项目已切回明文存储，这里仅负责脱敏显示。
 */

import { maskIdCard, maskPhone } from '@/lib/utils/mask'

export interface DecryptFieldConfig {
  field: string
  maskType: 'idCard' | 'phone' | 'none'
}

export async function decryptAndMaskRecords(
  records: Record<string, unknown>[],
  fields: DecryptFieldConfig[],
): Promise<Record<string, unknown>[]> {
  if (records.length === 0 || fields.length === 0) {
    return records
  }

  return records.map((record) => {
    const result: Record<string, unknown> = { ...record }

    for (const config of fields) {
      const value = record[config.field]
      if (typeof value !== 'string' || value.length === 0) {
        continue
      }

      switch (config.maskType) {
        case 'idCard':
          result[config.field] = maskIdCard(value)
          break
        case 'phone':
          result[config.field] = maskPhone(value)
          break
        case 'none':
          result[config.field] = value
          break
      }
    }

    return result
  })
}

export async function decryptIdCards(
  records: Record<string, unknown>[],
  field: string = 'idCard',
): Promise<Record<string, unknown>[]> {
  return decryptAndMaskRecords(records, [{ field, maskType: 'idCard' }])
}

export async function decryptPhones(
  records: Record<string, unknown>[],
  field: string = 'phone',
): Promise<Record<string, unknown>[]> {
  return decryptAndMaskRecords(records, [{ field, maskType: 'phone' }])
}
