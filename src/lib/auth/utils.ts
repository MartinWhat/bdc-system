/**
 * 认证工具函数
 */

import { hashPassword, verifyPassword, needsRehash } from './password'

/**
 * 哈希用户密码
 * @param password - 明文密码
 * @returns { passwordHash, salt }
 * 注意：bcrypt 将盐值嵌入哈希中，salt 字段保留为空字符串以兼容数据库 schema
 */
export async function hashUserPassword(
  password: string,
): Promise<{ passwordHash: string; salt: string }> {
  const passwordHash = await hashPassword(password)
  return { passwordHash, salt: '' } // bcrypt 盐值已嵌入哈希
}

/**
 * 验证用户密码
 * @param password - 输入的密码
 * @param storedHash - 存储的哈希
 * @param salt - 盐值（bcrypt 不需要，保留用于兼容）
 */
export async function validateUserPassword(
  password: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  return verifyPassword(password, storedHash)
}

/**
 * 检查密码哈希是否需要重新哈希（当 cost factor 升级时）
 * @param storedHash - 存储的哈希
 */
export function passwordNeedsRehash(storedHash: string): boolean {
  return needsRehash(storedHash)
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
