/**
 * Token 主动刷新模块
 * 在 Access Token 过期前自动刷新，避免 401 错误
 */

import { refreshAccessToken } from '@/lib/token-manager'

const REFRESH_BEFORE_SECONDS = 600 // 过期前 10 分钟刷新
const MIN_REFRESH_INTERVAL = 60000 // 最小刷新间隔（60 秒，防止并发）

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let lastRefreshTime = 0

/**
 * 解析 Access Token 剩余有效期（从 Cookie 中读取）
 * 注意：access_token 是 httpOnly，无法被 JavaScript 读取
 * 因此使用 access_token_exp cookie（非 httpOnly）来存储过期时间戳
 */
function getExpiresInFromCookie(): number | null {
  if (typeof document === 'undefined') return null

  console.log('[DEBUG token-expiry] getExpiresInFromCookie called')
  const cookies = document.cookie.split(';')
  console.log('[DEBUG token-expiry] all cookies:', cookies)
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'access_token_exp' && value) {
      console.log('[DEBUG token-expiry] access_token_exp cookie found:', value)
      try {
        const expTimestamp = parseInt(value, 10)
        if (!isNaN(expTimestamp)) {
          const now = Math.floor(Date.now() / 1000)
          const expiresIn = expTimestamp - now
          console.log('[DEBUG token-expiry] expiresIn:', expiresIn)
          return expiresIn
        }
      } catch (e) {
        console.error('[DEBUG token-expiry] parse error:', e)
        return null
      }
    }
  }
  console.log('[DEBUG token-expiry] access_token_exp cookie not found')
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
  console.log('[DEBUG token-expiry] startTokenExpiryTimer called', { expiresIn })
  stopTokenExpiryTimer()

  if (typeof window === 'undefined') {
    console.log('[DEBUG token-expiry] window is undefined, skipping')
    return
  }

  const ttl = expiresIn ?? getExpiresInFromCookie()
  console.log('[DEBUG token-expiry] ttl calculated:', ttl)
  if (!ttl || ttl <= 0) {
    console.log('[DEBUG token-expiry] ttl is invalid, skipping timer setup')
    return
  }

  const secondsUntilRefresh = getSecondsUntilRefresh(ttl)
  const timeoutMs = Math.min(secondsUntilRefresh * 1000, 2147483647)

  console.log(
    `[DEBUG token-expiry] Timer set for ${secondsUntilRefresh} seconds (expiresIn: ${ttl})`,
  )

  refreshTimer = setTimeout(async () => {
    console.log('[DEBUG token-expiry] Timer fired!')
    const now = Date.now()
    if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
      console.log('[DEBUG token-expiry] Skipping - less than 60s since last refresh')
      return
    }

    console.log('[DEBUG token-expiry] Calling refreshAccessToken')
    lastRefreshTime = now

    const success = await refreshAccessToken()
    if (success) {
      sessionStorage.setItem('bdc:last-refresh', String(now))
      console.log('[DEBUG token-expiry] Refresh success, restarting timer')
      startTokenExpiryTimer()
    } else {
      console.log('[DEBUG token-expiry] Refresh failed, stopping timer')
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
        console.log('[token-expiry] 检测到其他标签页刷新，重启定时器')
        startTokenExpiryTimer()
      }
    }
  }

  window.addEventListener('storage', handler)

  const customHandler = () => {
    console.log('[token-expiry] 收到 TOKEN_REFRESH_EVENT，重启定时器')
    startTokenExpiryTimer()
  }
  window.addEventListener('bdc:token-refresh' as any, customHandler)

  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('bdc:token-refresh' as any, customHandler)
  }
}
