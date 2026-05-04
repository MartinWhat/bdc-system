/**
 * 认证系统统一配置
 * 所有 Token 相关配置集中管理，避免不一致
 */

export const AUTH_CONFIG = {
  /**
   * Access Token 过期时间（秒）
   * 用于 JWT 签名和 Cookie 设置
   */
  ACCESS_TOKEN_EXPIRES_IN: 3600, // 1 小时

  /**
   * Refresh Token 过期时间（天）
   * 用于 Session 记录和 Cookie 设置
   */
  REFRESH_TOKEN_EXPIRES_IN_DAYS: 1, // 1 天

  /**
   * Session 中 Access Token 过期时间（小时）
   * 必须与 ACCESS_TOKEN_EXPIRES_IN 保持一致
   */
  SESSION_ACCESS_TOKEN_HOURS: 1, // 1 小时 = 3600 秒

  /**
   * 用户信息 Cookie 过期时间（天）
   * 与 Refresh Token 保持一致
   */
  USER_INFO_COOKIE_DAYS: 1, // 1 天
} as const

/**
 * 类型导出
 */
export type AuthConfig = typeof AUTH_CONFIG
