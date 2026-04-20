/**
 * SM3 哈希算法封装
 * 用于数据完整性校验、密码加密、哈希索引等
 */

import { sm3 } from 'sm-crypto'

/**
 * 计算 SM3 哈希值
 * @param data - 输入数据
 * @returns 十六进制哈希字符串 (64 字符)
 */
export function sm3Hash(data: string): string {
  return sm3(data)
}

/**
 * 计算 SM3-HMAC (基于哈希的消息认证码)
 * @param message - 消息
 * @param key - 密钥
 * @returns 十六进制 HMAC 字符串
 */
export function sm3Hmac(message: string, key: string): string {
  // 使用 sm-crypto 库的 hmac 实现，它正确处理 UTF-8 编码
  return sm3(message, { key, mode: 'hmac' })
}

/**
 * 生成盐值
 * @param length - 盐值长度（字节），默认 16
 * @returns 十六进制盐值字符串
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 密码加密（SM3 + 盐值）
 * @param password - 原始密码
 * @param salt - 盐值（可选，不提供则自动生成）
 * @returns { hash: string, salt: string }
 */
export function encryptPassword(password: string, salt?: string): { hash: string; salt: string } {
  const finalSalt = salt || generateSalt()
  const hash = sm3Hash(password + finalSalt)
  return { hash, salt: finalSalt }
}

/**
 * 验证密码
 * @param password - 输入的密码
 * @param storedHash - 存储的哈希值
 * @param salt - 盐值
 * @returns 是否匹配
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = encryptPassword(password, salt)
  return hash === storedHash
}

/**
 * 生成哈希索引（用于加密字段查询）
 * @param value - 敏感值（如身份证号）
 * @param secretKey - 密钥
 * @returns 哈希索引
 */
export function generateHashIndex(value: string, secretKey: string): string {
  return sm3Hmac(value, secretKey)
}
