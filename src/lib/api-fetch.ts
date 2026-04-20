/**
 * API 请求拦截器（双 Token 机制 - Cookie 安全版）
 * 使用 httpOnly Cookie 自动发送 Token，防止 XSS 攻击
 */

import {
  needsRefresh,
  refreshAccessToken,
  isAccessTokenExpired,
  clearTokens,
  extendTokenExpiry,
} from '@/lib/token-manager'
import { triggerAuthExpiry } from '@/lib/auth-event'

// 正在刷新 Token 的标志
let isRefreshing = false
// 等待刷新的请求队列
let refreshSubscribers: ((success: boolean) => void)[] = []

/**
 * 添加请求到等待队列
 */
function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb)
}

/**
 * 执行等待队列中的请求
 */
function onTokenRefreshed(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success))
  refreshSubscribers = []
}

/**
 * 增强的 fetch 函数（Cookie 安全版）
 * 自动处理 Access Token 刷新和重试
 */
export async function authFetch(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const { skipAuth, ...fetchOptions } = options

  // 跳过认证的请求（如登录、刷新 Token）
  if (skipAuth || url.includes('/login') || url.includes('/token/refresh')) {
    return fetch(url, {
      ...fetchOptions,
      credentials: 'include', // 始终包含 Cookie
    })
  }

  // 检查 Token 是否已过期
  if (isAccessTokenExpired()) {
    console.log('[api-fetch] Token expired, attempting refresh...')

    if (!isRefreshing) {
      isRefreshing = true
      const success = await refreshAccessToken()
      isRefreshing = false
      onTokenRefreshed(success)

      if (!success) {
        console.warn('[api-fetch] Token refresh failed, triggering auth expiry')
        clearTokens()
        triggerAuthExpiry()
        // 返回 401 响应
        return new Response(
          JSON.stringify({ error: '认证已过期，请重新登录', code: 'TOKEN_EXPIRED' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    } else {
      // 等待其他请求刷新
      await new Promise<void>((resolve) => {
        subscribeTokenRefresh((success) => {
          if (!success) {
            clearTokens()
            triggerAuthExpiry()
          }
          resolve()
        })
      })
    }
  }

  // 执行请求（Cookie 会自动发送）
  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include', // 自动发送 httpOnly Cookie
  })

  // 处理 401 错误
  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}))
    console.log('[api-fetch] 401 error:', errorData)

    // 如果是 Token 刷新失败导致的 401，清除 Token 并触发登出
    if (errorData.code === 'TOKEN_ROTATION_FAILED' || errorData.code === 'UNAUTHORIZED') {
      clearTokens()
      triggerAuthExpiry()
    }

    // 如果正在刷新，等待刷新完成
    if (!isRefreshing && needsRefresh()) {
      isRefreshing = true
      const success = await refreshAccessToken()
      isRefreshing = false
      onTokenRefreshed(success)

      if (success) {
        // 刷新成功，重试原请求
        return authFetch(url, options)
      } else {
        clearTokens()
        triggerAuthExpiry()
      }
    }
  }

  // 用户活动后延长 Token 过期时间
  if (response.ok) {
    extendTokenExpiry()
  }

  return response
}

/**
 * 创建带基础配置的 authFetch
 */
export function createAuthFetch(baseOptions: RequestInit = {}) {
  return (url: string, options: RequestInit = {}) => authFetch(url, { ...baseOptions, ...options })
}
