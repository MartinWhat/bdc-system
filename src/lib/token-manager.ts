/**
 * Token 管理模块
 * 负责 Token 的存储、刷新和过期处理
 */

const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const TOKEN_EXPIRY_KEY = 'token_expiry'

// Token 刷新阈值（提前 5 分钟刷新）
const REFRESH_THRESHOLD = 5 * 60 * 1000

// Token 有效期（毫秒）
const TOKEN_EXPIRY = 60 * 60 * 1000 // 1 小时

let refreshTimer: NodeJS.Timeout | null = null

/**
 * 设置 Token 并启动自动刷新
 */
export function setToken(token: string, user: unknown) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_EXPIRY))

  // 清除旧的定时器
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  // 设置新的刷新定时器
  scheduleRefresh()
}

/**
 * 获取 Token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
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
 * 清除 Token
 */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)

  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

/**
 * 检查 Token 是否需要刷新
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
 * 检查 Token 是否已过期
 */
export function isExpired(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  if (!expiry) return true

  return Date.now() >= parseInt(expiry)
}

/**
 * 刷新 Token
 */
export async function refreshToken(): Promise<boolean> {
  const token = getToken()
  if (!token) return false

  try {
    const response = await fetch('/api/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error('Token refresh failed:', data.error)
      return false
    }

    // 更新 Token
    setToken(data.data.token, getUser())
    return true
  } catch (error) {
    console.error('Token refresh error:', error)
    return false
  }
}

/**
 * 定时刷新 Token
 */
function scheduleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  // 在 Token 过期前 5 分钟刷新
  const refreshDelay = TOKEN_EXPIRY - REFRESH_THRESHOLD

  refreshTimer = setTimeout(async () => {
    const success = await refreshToken()
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
  const token = getToken()
  if (token) {
    scheduleRefresh()
  }
}
