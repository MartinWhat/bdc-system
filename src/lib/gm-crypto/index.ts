/**
 * 国密算法统一导出
 */

export {
  sm3Hash,
  sm3Hmac,
  generateSalt,
  encryptPassword,
  verifyPassword,
  generateHashIndex,
} from './sm3'

export { sm4Encrypt, sm4Decrypt, generateSM4Key } from './sm4'

export {
  encryptSensitiveField,
  decryptSensitiveField,
  generateQueryHash,
  createEncryptionContext,
  encryptWithContext,
  encryptSensitiveFields,
  encryptRecordsFields,
  decryptSensitiveFields,
  createEncryptionMiddleware,
  SENSITIVE_FIELDS,
  type SensitiveFieldConfig,
  type EncryptionContext,
} from './encryption'

export {
  findBdcByIdCard,
  findUserByPhone,
  findUserByIdCard,
  buildEncryptedWhereClause,
  buildEncryptedInClause,
} from './query'
