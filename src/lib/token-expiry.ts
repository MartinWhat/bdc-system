/**
 * Token 主动刷新模块
 * 在 Access Token 过期前自动刷新，避免 401 错误
 */

import { refreshAccessToken, TOKEN_REFRESH_EVENT } from '@/lib/token-manager'

const REFRESH_BEFORE_SECONDS = 600 // 过期前 10 分钟刷新
const MIN_REFRESH_INTERVAL = 60000 // 最小刷新间隔（60 秒，防止并发）

// 定义自定义事件类型映射
interface TokenRefreshEventMap {
  [TOKEN_REFRESH_EVENT]: CustomEvent
}

declare global {
  interface WindowEventMap extends TokenRefreshEventMap {}
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let lastRefreshTime = 0

/**
 * 解析 Access Token 剩余有效期（从 Cookie 中读取）
 * 注意：access_token 是 httpOnly，无法被 JavaScript 读取
 * 因此使用 access_token_exp cookie（非 httpOnly）来存储过期时间戳
 */
function getExpiresInFromCookie(): number | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'access_token_exp' && value) {
      try {
        const expTimestamp = parseInt(value, 10)
        if (!isNaN(expTimestamp)) {
          const now = Math.floor(Date.now() / 1000)
          const expiresIn = expTimestamp - now
          return expiresIn
        }
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * 计算距下次刷新的秒数
 */
function getSecondsUntilRefresh(expiresIn: number): number {
  const refreshAt = expiresIn - REFRESH_BEFORE_SECONDS
  return Math.max(refreshAt, MIN_REFRESH_INTERVAL / 1000)
}

/**
 * 清除当前定时器
 */
export function stopTokenExpiryTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

/**
 * 启动 Token 过期检测定时器
 * @param expiresIn - Access Token 剩余有效期（秒），如果不传则从 Cookie 解析
 */
export function startTokenExpiryTimer(expiresIn?: number): void {
  stopTokenExpiryTimer()

  if (typeof window === 'undefined') {
    return
  }

  const ttl = expiresIn ?? getExpiresInFromCookie()
  if (!ttl || ttl <= 0) {
    return
  }

  const secondsUntilRefresh = getSecondsUntilRefresh(ttl)
  const timeoutMs = Math.min(secondsUntilRefresh * 1000, 2147483647)

  refreshTimer = setTimeout(async () => {
    const now = Date.now()
    if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
      return
    }

    lastRefreshTime = now

    const success = await refreshAccessToken()
    if (success) {
      sessionStorage.setItem('bdc:last-refresh', String(now))
      startTokenExpiryTimer()
    } else {
      stopTokenExpiryTimer()
    }
  }, timeoutMs)
}

/**
 * 监听其他标签页的刷新事件（多标签同步）
 */
export function initTokenExpirySync(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (e: StorageEvent) => {
    if (e.key === 'bdc:last-refresh' && e.newValue) {
      const lastRefresh = parseInt(e.newValue, 10)
      if (!isNaN(lastRefresh) && Math.abs(lastRefresh - lastRefreshTime) > 1000) {
        startTokenExpiryTimer()
      }
    }
  }

  window.addEventListener('storage', handler)

  const customHandler = () => {
    startTokenExpiryTimer()
  }
  window.addEventListener(TOKEN_REFRESH_EVENT, customHandler)

  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener(TOKEN_REFRESH_EVENT, customHandler)
  }
}
