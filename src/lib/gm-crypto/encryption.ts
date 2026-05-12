/**
 * 明文敏感字段辅助函数
 * 兼容原有调用方，但不再执行加密或密钥管理。
 */

/**
 * 敏感字段配置
 */
export interface SensitiveFieldConfig {
  fieldName: string
  encryptedFieldName: string
  hashFieldName: string
}

/**
 * 预定义的敏感字段配置
 */
export const SENSITIVE_FIELDS: Record<string, SensitiveFieldConfig> = {
  idCard: {
    fieldName: 'idCard',
    encryptedFieldName: 'idCard',
    hashFieldName: 'idCardHash',
  },
  phone: {
    fieldName: 'phone',
    encryptedFieldName: 'phone',
    hashFieldName: 'phoneHash',
  },
}

/**
 * 明文上下文占位，保留原接口兼容性
 */
export interface EncryptionContext {
  mode: 'plaintext'
}

export async function createEncryptionContext(): Promise<EncryptionContext> {
  return { mode: 'plaintext' }
}

export function encryptWithContext(
  plaintext: string,
  context: EncryptionContext,
): { encrypted: string; hash: string } {
  void context
  return { encrypted: plaintext, hash: plaintext }
}

export async function encryptSensitiveField(
  plaintext: string,
): Promise<{ encrypted: string; hash: string }> {
  return { encrypted: plaintext, hash: plaintext }
}

export async function encryptSensitiveFields(
  plaintexts: string[],
): Promise<Array<{ encrypted: string; hash: string }>> {
  return plaintexts.map((plaintext) => ({ encrypted: plaintext, hash: plaintext }))
}

export async function encryptRecordsFields<T extends Record<string, string | undefined>>(
  records: T[],
  fields: string[],
): Promise<Array<T & Record<string, { encrypted: string; hash: string }>>> {
  return records.map((record) => {
    const encryptedFields: Record<string, { encrypted: string; hash: string }> = {}

    for (const field of fields) {
      const value = record[field]
      if (value) {
        encryptedFields[field] = { encrypted: value, hash: value }
      }
    }

    return { ...record, ...encryptedFields } as T &
      Record<string, { encrypted: string; hash: string }>
  })
}

export async function decryptSensitiveField(value: string): Promise<string> {
  return value
}

export async function decryptSensitiveFields(values: string[]): Promise<string[]> {
  return values
}

export async function decryptRecordsFields<T extends Record<string, string | undefined>>(
  record: T,
  fields: string[],
): Promise<T> {
  const decrypted: Record<string, string> = {}

  for (const field of fields) {
    const value = record[field]
    if (value) {
      decrypted[field] = value
    }
  }

  return { ...record, ...decrypted } as T
}

export function generateQueryHash(value: string, masterKey?: string): string {
  void masterKey
  return value
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEncryptionMiddleware<T extends Record<string, any>>(
  records: T[],
  fields: string[],
): Promise<T[]> {
  return encryptRecordsFields(records, fields) as Promise<T[]>
}
