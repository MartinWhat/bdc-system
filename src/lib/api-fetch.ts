/**
 * API 请求拦截器
 * 直接依赖 Better Auth 会话 Cookie，不再处理 token 刷新
 */

import { triggerAuthExpiry } from '@/lib/auth-event'
import { message } from 'antd'

/**
 * 增强的 fetch 函数
 * 自动处理 401 / 403 反馈
 */
export async function authFetch(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const { skipAuth, ...fetchOptions } = options

  // 跳过认证的请求（如登录）
  if (skipAuth || url.includes('/login')) {
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
    await response
      .clone()
      .json()
      .catch(() => ({}))
    triggerAuthExpiry()
  }

  return response
}

/**
 * 创建带基础配置的 authFetch
 */
export function createAuthFetch(baseOptions: RequestInit = {}) {
  return (url: string, options: RequestInit = {}) => authFetch(url, { ...baseOptions, ...options })
}
