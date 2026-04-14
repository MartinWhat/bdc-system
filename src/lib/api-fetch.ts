/**
 * API 请求拦截器
 * 自动处理 Token 刷新和认证错误
 */

import { message } from 'antd'
import { getToken, clearToken, refreshToken } from '@/lib/token-manager'

// 正在刷新 Token 的标志
let isRefreshing = false
// 等待刷新的请求队列
let refreshSubscribers: ((token: string) => void)[] = []

/**
 * 添加请求到等待队列
 */
function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

/**
 * 执行等待队列中的请求
 */
function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

/**
 * 格式化请求头
 */
function buildHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getToken()
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * 增强的 fetch 函数
 * 自动处理 Token 刷新和重试
 */
export async function authFetch(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const { skipAuth, ...fetchOptions } = options

  // 跳过认证的请求（如登录）
  if (skipAuth || url.includes('/login')) {
    return fetch(url, fetchOptions)
  }

  const token = getToken()

  // 如果没有 Token，尝试刷新
  if (!token) {
    const refreshed = await refreshToken()
    if (!refreshed) {
      // 刷新失败，跳转到登录页
      window.location.href = '/login'
      return Promise.reject(new Error('未认证'))
    }
  }

  // 添加 Token 到请求头
  const authOptions = {
    ...fetchOptions,
    headers: buildHeaders(fetchOptions.headers),
  }

  try {
    let response = await fetch(url, authOptions)

    // 如果是 401 错误，尝试刷新 Token
    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))

      // 如果是 Token 过期错误
      if (errorData.code === 'INVALID_TOKEN' || errorData.code === 'UNAUTHORIZED') {
        if (!isRefreshing) {
          isRefreshing = true

          try {
            const refreshed = await refreshToken()

            if (refreshed) {
              const newToken = getToken()
              if (newToken) {
                // 执行等待队列中的请求
                onTokenRefreshed(newToken)

                // 重试原请求
                const retryOptions = {
                  ...authOptions,
                  headers: buildHeaders(authOptions.headers),
                }
                response = await fetch(url, retryOptions)
              }
            } else {
              // 刷新失败，清除 Token 并跳转登录
              clearToken()
              message.error('认证已过期，请重新登录')
              setTimeout(() => {
                window.location.href = '/login'
              }, 1000)
              return Promise.reject(new Error('Token refresh failed'))
            }
          } catch (error) {
            console.error('Token refresh error:', error)
            clearToken()
            window.location.href = '/login'
            return Promise.reject(error)
          } finally {
            isRefreshing = false
          }
        } else {
          // 如果正在刷新，将请求加入等待队列
          return new Promise((resolve) => {
            subscribeTokenRefresh((newToken: string) => {
              const retryOptions = {
                ...authOptions,
                headers: {
                  ...authOptions.headers,
                  Authorization: `Bearer ${newToken}`,
                },
              }
              fetch(url, retryOptions).then(resolve)
            })
          })
        }
      }
    }

    return response
  } catch (error) {
    console.error('Request error:', error)
    throw error
  }
}

/**
 * 创建认证的 fetch 包装器
 */
export function createAuthFetch(baseOptions: RequestInit = {}) {
  return (url: string, options: RequestInit = {}) => authFetch(url, { ...baseOptions, ...options })
}
