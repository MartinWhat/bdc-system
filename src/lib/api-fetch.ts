/**
 * API 请求拦截器（双 Token 机制）
 * 自动处理 Access Token 刷新和认证错误
 */

import {
  getAccessToken,
  getRefreshToken,
  clearTokens,
  refreshAccessToken,
} from '@/lib/token-manager'
import { triggerAuthExpiry } from '@/lib/auth-event'

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
  const token = getAccessToken()
  if (!token) {
    console.warn('[api-fetch] No access token available')
    return headers
  }
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}

/**
 * 增强的 fetch 函数（双 Token 机制）
 * 自动处理 Access Token 刷新和重试
 */
export async function authFetch(
  url: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const { skipAuth, ...fetchOptions } = options

  // 跳过认证的请求（如登录、刷新 Token）
  if (skipAuth || url.includes('/login') || url.includes('/token/refresh')) {
    return fetch(url, fetchOptions)
  }

  let accessToken = getAccessToken()

  // 如果没有 Access Token，尝试刷新
  if (!accessToken) {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      console.log('[api-fetch] No access token, attempting refresh...')
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        // 刷新失败，清除 Token
        clearTokens()
        console.log('[api-fetch] Token refresh failed, triggering auth expiry event')
        // 触发认证失效事件（layout 会监听并显示弹窗）
        triggerAuthExpiry()
        // 返回 401 响应，让上层处理（layout 拦截器会显示弹窗）
        return new Response(JSON.stringify({ error: '认证已过期', code: 'ACCESS_TOKEN_EXPIRED' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // 刷新成功，获取新 token
      accessToken = getAccessToken()
      console.log('[api-fetch] Token refreshed successfully')
    } else {
      // 没有 Refresh Token，返回 401
      console.log('[api-fetch] No refresh token, triggering auth expiry event')
      // 触发认证失效事件
      triggerAuthExpiry()
      return new Response(JSON.stringify({ error: '未认证', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // 添加 Access Token 到请求头
  const authOptions = {
    ...fetchOptions,
    headers: {
      ...fetchOptions.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  }

  try {
    let response = await fetch(url, authOptions)
    console.log('[api-fetch] Response status:', response.status, 'for URL:', url)

    // 如果是 401 错误，尝试刷新 Token
    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))
      console.log('[api-fetch] 401 error data:', errorData)

      // 如果是 Access Token 过期错误
      if (
        errorData.code === 'INVALID_TOKEN' ||
        errorData.code === 'UNAUTHORIZED' ||
        errorData.code === 'ACCESS_TOKEN_EXPIRED'
      ) {
        if (!isRefreshing) {
          isRefreshing = true

          try {
            const refreshed = await refreshAccessToken()

            if (refreshed) {
              const newToken = getAccessToken()
              if (newToken) {
                // 执行等待队列中的请求
                onTokenRefreshed(newToken)

                // 重试原请求
                const retryOptions = {
                  ...authOptions,
                  headers: {
                    ...authOptions.headers,
                    Authorization: `Bearer ${newToken}`,
                  },
                }
                response = await fetch(url, retryOptions)
              }
            } else {
              // 刷新失败，清除 Token
              clearTokens()
              console.log(
                '[api-fetch] Token refresh failed in 401 handler, triggering auth expiry event',
              )
              // 触发认证失效事件
              triggerAuthExpiry()
              // 返回 401 响应，让上层处理
              return new Response(
                JSON.stringify({ error: '认证已过期', code: 'ACCESS_TOKEN_EXPIRED' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } },
              )
            }
          } catch (error) {
            console.error('Token refresh error:', error)
            clearTokens()
            console.log('[api-fetch] Token refresh error, triggering auth expiry event')
            // 触发认证失效事件
            triggerAuthExpiry()
            // 返回 401 响应
            return new Response(JSON.stringify({ error: '认证失败', code: 'UNAUTHORIZED' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
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

    // 如果是 500 错误且错误与认证相关（如 JWT 密钥配置错误）
    if (response.status === 500) {
      const errorData = await response.json().catch(() => ({}))
      console.log('[api-fetch] 500 error data:', errorData)

      // 认证服务配置错误（通常是 JWT 密钥问题）
      if (
        errorData.code === 'AUTH_CONFIG_ERROR' ||
        errorData.code === 'AUTH_ERROR' ||
        errorData.code === 'SERVER_ERROR'
      ) {
        console.log('[api-fetch] Auth config error detected, triggering auth expiry event')
        console.log('[api-fetch] Calling clearTokens()')
        // 清除 Token
        clearTokens()
        console.log('[api-fetch] Calling triggerAuthExpiry()')
        // 触发认证失效事件
        triggerAuthExpiry()
        console.log('[api-fetch] triggerAuthExpiry() called, returning 401')
        // 返回 401 响应，让上层显示弹窗
        return new Response(
          JSON.stringify({ error: '认证服务异常，请重新登录', code: 'AUTH_CONFIG_ERROR' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    return response
  } catch (error) {
    console.error('[api-fetch] Request error:', error)
    throw error
  }
}

/**
 * 创建认证的 fetch 包装器
 */
export function createAuthFetch(baseOptions: RequestInit = {}) {
  return (url: string, options: RequestInit = {}) => authFetch(url, { ...baseOptions, ...options })
}
