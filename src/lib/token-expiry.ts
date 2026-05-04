/**
 * Token 主动刷新模块
 * 在 Access Token 过期前自动刷新，避免 401 错误
 * 支持滑动过期：用户有活动时延长刷新窗口
 */

import { refreshAccessToken, TOKEN_REFRESH_EVENT } from '@/lib/token-manager'

const REFRESH_BEFORE_SECONDS = 600 // 过期前 10 分钟刷新
const MIN_REFRESH_INTERVAL = 60000 // 最小刷新间隔（60 秒，防止并发）
const ACTIVITY_WINDOW_SECONDS = 1800 // 30 分钟无活动则停止刷新

// 定义自定义事件类型映射
interface TokenRefreshEventMap {
  [TOKEN_REFRESH_EVENT]: CustomEvent
}

declare global {
  interface WindowEventMap extends TokenRefreshEventMap {}
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let lastRefreshTime = 0

const ACTIVITY_KEY = 'bdc:last-activity'

/**
 * 获取最近活动时间的Unix时间戳（秒）
 */
function getLastActivity(): number {
  if (typeof sessionStorage === 'undefined') return 0
  const stored = sessionStorage.getItem(ACTIVITY_KEY)
  return stored ? parseInt(stored, 10) : 0
}

/**
 * 更新最近活动时间
 */
function updateActivity(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(ACTIVITY_KEY, String(Math.floor(Date.now() / 1000)))
  }
}

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
 * 检查是否可以刷新（滑动过期逻辑）
 * 用户超过 ACTIVITY_WINDOW_SECONDS 无活动则停止刷新
 */
function canRefresh(): boolean {
  const lastActivity = getLastActivity()
  if (lastActivity === 0) {
    // 首次加载，视为有活动
    return true
  }
  const now = Math.floor(Date.now() / 1000)
  const idleSeconds = now - lastActivity
  return idleSeconds < ACTIVITY_WINDOW_SECONDS
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

    // 检查是否在活动窗口内
    if (!canRefresh()) {
      stopTokenExpiryTimer()
      return
    }

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
 * 初始化用户活动监听
 * 每次页面加载或用户点击时更新活动时间
 */
export function initActivityTracker(): () => void {
  if (typeof window === 'undefined') return () => {}

  // 初始化活动时间为当前时刻
  updateActivity()

  // 监听用户活动（点击、按键、滚动）
  const events = ['click', 'keydown', 'scroll', 'touchstart']
  let lastKnownActivity = getLastActivity()

  const handleActivity = () => {
    const now = Math.floor(Date.now() / 1000)
    if (now - lastKnownActivity > 60) {
      // 每分钟最多更新一次，减少 sessionStorage 写入
      lastKnownActivity = now
      updateActivity()

      // 如果当前有定时器但即将过期，重新计算刷新时间
      if (refreshTimer) {
        const ttl = getExpiresInFromCookie()
        if (ttl && ttl > 0) {
          const secondsUntilRefresh = getSecondsUntilRefresh(ttl)
          // 如果距离刷新超过窗口时间，停止定时器
          if (secondsUntilRefresh > ACTIVITY_WINDOW_SECONDS) {
            stopTokenExpiryTimer()
          }
        }
      }
    }
  }

  events.forEach((event) => {
    window.addEventListener(event, handleActivity, { passive: true })
  })

  return () => {
    events.forEach((event) => {
      window.removeEventListener(event, handleActivity)
    })
  }
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
