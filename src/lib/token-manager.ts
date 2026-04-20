/**
 * Token 管理模块（双 Token 机制 - Cookie 安全版）
 * 使用 httpOnly Cookie 存储 Token，防止 XSS 攻击
 */

import { triggerAuthExpiry } from '@/lib/auth-event'

// Token 刷新阈值（提前 5 分钟刷新）
const REFRESH_THRESHOLD = 5 * 60 * 1000

// Access Token 有效期（毫秒）
const ACCESS_TOKEN_EXPIRY = 30 * 60 * 1000 // 30 分钟

// Token 刷新成功事件（用于多标签页同步）
export const TOKEN_REFRESH_EVENT = 'bdc:token-refresh'

let refreshTimer: NodeJS.Timeout | null = null
let isRefreshing = false
let tokenExpiryTime: number | null = null

/**
 * 设置 Token 过期时间（本地内存，不存储敏感数据）
 */
function setTokenExpiry(expiresIn: number) {
  tokenExpiryTime = Date.now() + expiresIn * 1000
}

/**
 * 启动自动刷新定时器
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
 * 获取 Token 过期时间
 */
export function getTokenExpiry(): number | null {
  return tokenExpiryTime
}

/**
 * 检查是否需要刷新 Token
 */
export function needsRefresh(): boolean {
  if (!tokenExpiryTime) return true

  const now = Date.now()
  return now + REFRESH_THRESHOLD >= tokenExpiryTime
}

/**
 * 检查 Access Token 是否已过期
 */
export function isAccessTokenExpired(): boolean {
  if (!tokenExpiryTime) return true
  return Date.now() >= tokenExpiryTime
}

/**
 * 刷新 Access Token（使用 Refresh Token）
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) {
    return false
  }

  isRefreshing = true

  try {
    const response = await fetch('/api/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 自动发送 Cookie
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error('Token refresh failed:', data.error)
      return false
    }

    // 更新本地过期时间（Token 存储在 Cookie 中）
    setTokenExpiry(data.data.expiresIn)
    scheduleRefresh()

    // 触发刷新事件通知其他模块
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT))
    return true
  } catch (error) {
    console.error('Token refresh error:', error)
    return false
  } finally {
    isRefreshing = false
  }
}

/**
 * 清除 Token（仅清除本地状态，Cookie 由后端清除）
 */
export function clearTokens() {
  tokenExpiryTime = null

  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  // 触发认证失效事件
  triggerAuthExpiry()
}

/**
 * 初始化 Token 管理
 * 在应用启动时调用
 */
export function initTokenManager() {
  // Cookie 模式下，Token 自动发送，只需设置刷新定时器
  // 过期时间由后端 Cookie Max-Age 控制
  scheduleRefresh()
}

/**
 * 获取认证信息（用于 Zustand store）
 * 注意：Token 无法从 JavaScript 读取，仅返回过期时间
 */
export function getAuthInfo() {
  return {
    isAuthenticated: tokenExpiryTime !== null && !isAccessTokenExpired(),
    tokenExpiry: tokenExpiryTime,
  }
}

/**
 * 延长 Token 过期时间（滑动过期）
 * 每次用户活动时调用，延长 30 分钟有效期
 */
export function extendTokenExpiry() {
  if (!tokenExpiryTime) return

  // 更新本地过期时间
  tokenExpiryTime = Date.now() + ACCESS_TOKEN_EXPIRY

  // 重置刷新定时器
  scheduleRefresh()
}
