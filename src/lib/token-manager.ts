/**
 * Token 管理模块（双 Token 机制）
 * 负责 Access Token 和 Refresh Token 的存储、刷新和过期处理
 */

import { triggerAuthExpiry } from '@/lib/auth-event'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'user'
const TOKEN_EXPIRY_KEY = 'token_expiry'

// Access Token 刷新阈值（提前 5 分钟刷新）
const REFRESH_THRESHOLD = 5 * 60 * 1000

// Access Token 有效期（毫秒）
const ACCESS_TOKEN_EXPIRY = 30 * 60 * 1000 // 30 分钟

// Token 刷新成功事件（用于多标签页同步）
export const TOKEN_REFRESH_EVENT = 'bdc:token-refresh'

let refreshTimer: NodeJS.Timeout | null = null
let isRefreshing = false

/**
 * 设置双 Token 并启动自动刷新
 */
export function setTokens(accessToken: string, refreshToken: string, user: unknown) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + ACCESS_TOKEN_EXPIRY))

  // 清除旧的定时器
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  // 设置新的刷新定时器
  scheduleRefresh()

  // 触发事件通知其他标签页（当前标签页监听 storage 事件同步）
  window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT, { detail: { accessToken } }))
}

/**
 * 获取 Access Token
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

/**
 * 获取 Refresh Token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/**
 * 获取用户信息
 */
export function getUser(): unknown | null {
  const userStr = localStorage.getItem(USER_KEY)
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

/**
 * 清除所有 Token
 */
export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)

  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  // 触发认证失效事件
  triggerAuthExpiry()
}

/**
 * 检查 Access Token 是否需要刷新
 */
export function needsRefresh(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  if (!expiry) return true

  const now = Date.now()
  const expiryTime = parseInt(expiry)

  // 如果距离过期时间少于阈值，需要刷新
  return now + REFRESH_THRESHOLD >= expiryTime
}

/**
 * 检查 Access Token 是否已过期
 */
export function isAccessTokenExpired(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  if (!expiry) return true

  return Date.now() >= parseInt(expiry)
}

/**
 * 刷新 Access Token（使用 Refresh Token）
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) {
    return false
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return false
  }

  isRefreshing = true

  try {
    const response = await fetch('/api/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error('Token refresh failed:', data.error)
      // 刷新失败，清除所有 Token
      clearTokens()
      return false
    }

    // 更新双 Token
    setTokens(data.data.accessToken, data.data.refreshToken, getUser())
    return true
  } catch (error) {
    console.error('Token refresh error:', error)
    return false
  } finally {
    isRefreshing = false
  }
}

/**
 * 定时刷新 Access Token
 */
function scheduleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  // 在 Access Token 过期前 5 分钟刷新
  const refreshDelay = ACCESS_TOKEN_EXPIRY - REFRESH_THRESHOLD

  refreshTimer = setTimeout(async () => {
    const success = await refreshAccessToken()
    if (!success) {
      console.warn('Token refresh failed, user will be logged out')
    }
  }, refreshDelay)
}

/**
 * 初始化 Token 管理
 * 在应用启动时调用
 */
export function initTokenManager() {
  const token = getAccessToken()
  if (token) {
    scheduleRefresh()
  }
}

/**
 * 获取所有认证信息（用于 Zustand store）
 */
export function getAuthInfo() {
  return {
    accessToken: getAccessToken(),
    refreshToken: getRefreshToken(),
    user: getUser(),
    isAuthenticated: !!getAccessToken(),
  }
}

/**
 * 延长 Token 过期时间（滑动过期）
 * 每次用户活动时调用，延长 30 分钟有效期
 */
export function extendTokenExpiry() {
  const token = getAccessToken()
  if (!token) return

  // 更新本地过期时间
  const newExpiry = Date.now() + ACCESS_TOKEN_EXPIRY
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(newExpiry))

  // 重置刷新定时器
  scheduleRefresh()

  // 通知其他标签页
  window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT))
}
