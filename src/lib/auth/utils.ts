/**
 * 认证工具函数
 */

import { encryptPassword, verifyPassword } from '@/lib/gm-crypto'

/**
 * 哈希用户密码
 * @param password - 明文密码
 * @returns { passwordHash, salt }
 */
export function hashUserPassword(password: string): { passwordHash: string; salt: string } {
  const { hash, salt } = encryptPassword(password)
  return { passwordHash: hash, salt }
}

/**
 * 验证用户密码
 * @param password - 输入的密码
 * @param storedHash - 存储的哈希
 * @param salt - 盐值
 */
export function validateUserPassword(password: string, storedHash: string, salt: string): boolean {
  return verifyPassword(password, storedHash, salt)
}

/**
 * 生成会话令牌
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 权限检查辅助函数
 */
export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  return userPermissions.includes(requiredPermission)
}

/**
 * 角色检查辅助函数
 */
export function hasRole(userRoles: string[], requiredRole: string): boolean {
  return userRoles.includes(requiredRole)
}
