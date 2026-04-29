/**
 * Token 管理模块（简化版 - Cookie 安全）
 * 使用 httpOnly Cookie 存储 Token，客户端不再追踪过期时间
 */

import { triggerAuthExpiry } from '@/lib/auth-event'

// Token 刷新成功事件（用于多标签页同步）
export const TOKEN_REFRESH_EVENT = 'bdc:token-refresh'

/**
 * 刷新 Access Token（使用 Refresh Token）
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 自动发送 Cookie（包含 Refresh Token）
    })

    if (!response.ok) {
      console.error('Token refresh failed:', response.status)
      return false
    }

    // 触发刷新事件通知其他模块（仅浏览器环境）
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT))
    }
    return true
  } catch (error) {
    console.error('Token refresh error:', error)
    return false
  }
}

/**
 * 清除 Token
 */
export function clearTokens() {
  triggerAuthExpiry()
}

/**
 * 初始化 Token 管理
 * Cookie 模式下 Token 由 httpOnly Cookie 自动管理，此函数不再做任何操作
 */
export function initTokenManager() {
  // 空函数，Token 管理由 httpOnly Cookie 处理
}
