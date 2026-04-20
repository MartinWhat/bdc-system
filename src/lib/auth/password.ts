/**
 * 密码哈希模块（使用 bcrypt）
 * 提供安全的密码加密和验证功能
 */

import bcrypt from 'bcryptjs'

// bcrypt cost factor (work factor)
// 值越大越安全，但计算时间越长
// 12 是推荐的最小值，生产环境可考虑 13-14
const BCRYPT_ROUNDS = 12

/**
 * 生成盐值并哈希密码
 * @param password - 原始密码
 * @returns 哈希后的密码字符串
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS)
  return bcrypt.hash(password, salt)
}

/**
 * 验证密码
 * @param password - 输入的密码
 * @param hashedPassword - 存储的哈希密码
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

/**
 * 检查密码是否需要重新哈希（当 cost factor 升级时）
 * @param hashedPassword - 已存储的哈希密码
 * @returns 是否需要重新哈希
 */
export function needsRehash(hashedPassword: string): boolean {
  // bcrypt 哈希格式：$2a$cost$salt+hash
  // 例如：$2a$12$...
  const parts = hashedPassword.split('$')
  if (parts.length !== 4) {
    return true
  }

  const currentRounds = parseInt(parts[2], 10)
  return currentRounds < BCRYPT_ROUNDS
}
