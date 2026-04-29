/**
 * API 请求拦截器（双 Token 机制 - Cookie 安全版）
 * 使用 httpOnly Cookie 自动发送 Token，防止 XSS 攻击
 */

import { refreshAccessToken, clearTokens } from '@/lib/token-manager'
import { triggerAuthExpiry } from '@/lib/auth-event'
import { message } from 'antd'

// 正在刷新 Token 的 Promise（用于防止并发刷新）
let refreshPromise: Promise<boolean> | null = null

/**
 * 获取刷新 Promise
 */
function getRefreshPromise(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
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

  // 执行请求（Cookie 会自动发送）
  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include', // 自动发送 httpOnly Cookie
  })

  // 处理 403 错误 - 提示权限不足
  if (response.status === 403) {
    try {
      // 使用 clone() 读取错误信息，避免消耗原始 response body
      const errorData = await response.clone().json()
      message.error(errorData.error || '权限不足，无法访问该资源')
    } catch {
      message.error('权限不足')
    }
  }

  // 处理 401 错误 - 尝试刷新 Token
  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}))

    // 如果是 Token 无效/过期，尝试刷新
    if (
      errorData.code === 'INVALID_TOKEN' ||
      errorData.code === 'UNAUTHORIZED' ||
      errorData.code === 'TOKEN_EXPIRED'
    ) {
      const success = await getRefreshPromise()

      if (success) {
        // 刷新成功，重试原请求
        return authFetch(url, options)
      } else {
        // 刷新失败，清除状态并触发登出
        clearTokens()
        triggerAuthExpiry()
      }
    } else {
      // 其他 401 错误（如 Token 轮换失败），直接清除状态
      clearTokens()
      triggerAuthExpiry()
    }
  }

  return response
}

/**
 * 创建带基础配置的 authFetch
 */
export function createAuthFetch(baseOptions: RequestInit = {}) {
  return (url: string, options: RequestInit = {}) => authFetch(url, { ...baseOptions, ...options })
}
