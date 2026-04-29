/**
 * 服务端加密工具
 * 使用 AES-256-GCM 加密 Cookie 中的用户信息
 * 密钥通过 COOKIE_ENCRYPTION_KEY 环境变量配置（32 字节 hex）
 */

import crypto from 'crypto'

/**
 * 获取加密密钥
 * 密钥为 32 字节（256 位），hex 编码
 */
function getKey(): Buffer {
  const key = process.env.COOKIE_ENCRYPTION_KEY || process.env.JWT_SECRET_KEY
  if (!key) {
    throw new Error('COOKIE_ENCRYPTION_KEY 环境变量未配置')
  }
  // 如果密钥不足 32 字节，用 SHA-256 派生
  const raw = Buffer.from(key, 'hex')
  if (raw.length === 32) return raw
  return crypto.createHash('sha256').update(key).digest()
}

/**
 * 加密数据（AES-256-GCM）
 * @param data 任意可 JSON 序列化的数据
 * @returns 加密字符串，格式：iv:authTag:ciphertext（均为 hex）
 */
export function encrypt(data: unknown): string {
  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const json = JSON.stringify(data)
  let encrypted = cipher.update(json, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * 解密数据（AES-256-GCM）
 * @param encryptedStr - encrypt() 输出的字符串
 * @returns 原始数据，解密失败返回 null
 */
export function decrypt<T = unknown>(encryptedStr: string): T | null {
  try {
    const key = getKey()
    const parts = encryptedStr.split(':')
    if (parts.length !== 3) return null

    const [ivHex, authTagHex, ciphertext] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return JSON.parse(decrypted) as T
  } catch {
    return null
  }
}
