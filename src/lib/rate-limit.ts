/**
 * 速率限制模块
 * 基于 IP 和用户名实现速率限制，防止暴力破解和 DoS 攻击
 */

import { NextRequest, NextResponse } from 'next/server'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

// 账户锁定存储
interface AccountLockoutStore {
  [username: string]: {
    failedAttempts: number // 连续失败次数
    lockedUntil: number | null // 锁定截止时间
    lastFailedAt: number // 最后失败时间
  }
}

// 内存存储（生产环境建议使用 Redis）
// 注意：内存存储在 serverless或多实例部署时不生效，限流可被绕过
// TODO(生产环境): 替换为 Redis 存储，使用原子操作保证限流准确性
const store: RateLimitStore = {}

// 账户锁定存储（独立管理）
const lockoutStore: AccountLockoutStore = {}

// 账户锁定配置
const ACCOUNT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 5, // 连续失败 5 次后锁定
  lockoutDurationMs: 15 * 60 * 1000, // 锁定 15 分钟
  resetFailedAttemptsAfterMs: 30 * 60 * 1000, // 30 分钟无失败后重置计数
}

// 清理过期记录的间隔（毫秒）
const CLEANUP_INTERVAL = 60 * 1000 // 1 分钟

// 默认配置
const DEFAULT_CONFIG = {
  // 登录接口：5 次/分钟
  LOGIN: {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 1 分钟
    message: '登录尝试次数过多，请稍后再试',
  },
  // Token 刷新接口：10 次/分钟
  TOKEN_REFRESH: {
    maxAttempts: 10,
    windowMs: 60 * 1000, // 1 分钟
    message: '请求过于频繁，请稍后再试',
  },
  // 通用接口：100 次/分钟
  GENERAL: {
    maxAttempts: 100,
    windowMs: 60 * 1000, // 1 分钟
    message: '请求过于频繁，请稍后再试',
  },
}

/**
 * 生成速率限制键
 */
function generateKey(identifier: string, type: string): string {
  return `${type}:${identifier}`
}

/**
 * 检查并更新速率限制
 * @param identifier - 标识符（IP 地址或用户名）
 * @param type - 速率限制类型
 * @returns 是否允许请求
 */
export function checkRateLimit(
  identifier: string,
  type: keyof typeof DEFAULT_CONFIG = 'GENERAL',
): { allowed: boolean; remaining: number; resetTime: number } {
  const config = DEFAULT_CONFIG[type]
  const key = generateKey(identifier, type)
  const now = Date.now()

  const record = store[key]

  // 没有记录或已过期，创建新记录
  if (!record || now > record.resetTime) {
    store[key] = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetTime: store[key].resetTime,
    }
  }

  // 检查是否超过限制
  if (record.count >= config.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }

  // 更新计数
  record.count++
  return {
    allowed: true,
    remaining: config.maxAttempts - record.count,
    resetTime: record.resetTime,
  }
}

/**
 * 获取客户端标识符（IP 地址）
 */
export function getClientIdentifier(request: NextRequest): string {
  // 从 X-Forwarded-For 头获取真实 IP
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // X-Forwarded-For 可能包含多个 IP，取第一个
    return forwardedFor.split(',')[0].trim()
  }

  // 从 X-Real-IP 头获取
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // 无法获取 IP 时返回未知
  return 'unknown'
}

/**
 * 速率限制中间件装饰器
 * @param type - 速率限制类型
 * @param getIdentifier - 自定义标识符获取函数（默认使用 IP）
 */
export function withRateLimit(
  type: keyof typeof DEFAULT_CONFIG = 'GENERAL',
  getIdentifier?: (request: NextRequest) => string,
) {
  return function (
    handler: (request: NextRequest) => Promise<NextResponse>,
  ): (request: NextRequest) => Promise<NextResponse> {
    return async function (request: NextRequest): Promise<NextResponse> {
      const identifier = getIdentifier ? getIdentifier(request) : getClientIdentifier(request)
      const result = checkRateLimit(identifier, type)

      if (!result.allowed) {
        const config = DEFAULT_CONFIG[type]
        const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)

        return NextResponse.json(
          {
            error: config.message,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter,
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.maxAttempts.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': result.resetTime.toString(),
            },
          },
        )
      }

      const response = await handler(request)

      // 添加速率限制头信息
      response.headers.set('X-RateLimit-Limit', DEFAULT_CONFIG[type].maxAttempts.toString())
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
      response.headers.set('X-RateLimit-Reset', result.resetTime.toString())

      return response
    }
  }
}

/**
 * 清理过期记录
 */
function cleanupExpiredRecords() {
  const now = Date.now()
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }
}

// 启动定时清理任务
if (typeof global !== 'undefined') {
  setInterval(cleanupExpiredRecords, CLEANUP_INTERVAL)
}

/**
 * 重置指定标识符的速率限制（用于登录成功后）
 */
export function resetRateLimit(identifier: string, type: keyof typeof DEFAULT_CONFIG = 'LOGIN') {
  const key = generateKey(identifier, type)
  delete store[key]
}

/**
 * 检查账户是否被锁定
 * @param username - 用户名
 * @returns 是否被锁定及锁定截止时间
 */
export function isAccountLocked(username: string): { locked: boolean; lockedUntil: number | null } {
  const record = lockoutStore[username]
  if (!record) {
    return { locked: false, lockedUntil: null }
  }

  // 检查是否已过锁定时间
  if (record.lockedUntil && Date.now() > record.lockedUntil) {
    // 锁定已过期，清除记录
    delete lockoutStore[username]
    return { locked: false, lockedUntil: null }
  }

  return { locked: true, lockedUntil: record.lockedUntil }
}

/**
 * 记录登录失败
 * @param username - 用户名
 */
export function recordLoginFailure(username: string): void {
  const now = Date.now()
  const record = lockoutStore[username]

  if (!record) {
    lockoutStore[username] = {
      failedAttempts: 1,
      lockedUntil: null,
      lastFailedAt: now,
    }
    return
  }

  // 检查是否需要重置失败计数（30分钟无失败）
  if (now - record.lastFailedAt > ACCOUNT_LOCKOUT_CONFIG.resetFailedAttemptsAfterMs) {
    record.failedAttempts = 1
    record.lastFailedAt = now
    record.lockedUntil = null
    return
  }

  record.failedAttempts++
  record.lastFailedAt = now

  // 检查是否需要锁定账户
  if (record.failedAttempts >= ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts) {
    record.lockedUntil = now + ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs
  }
}

/**
 * 清除登录失败记录（登录成功后调用）
 * @param username - 用户名
 */
export function clearLoginFailure(username: string): void {
  delete lockoutStore[username]
}

/**
 * 获取账户锁定状态
 * @param username - 用户名
 * @returns 锁定状态信息
 */
export function getAccountLockoutStatus(username: string): {
  failedAttempts: number
  isLocked: boolean
  lockedUntil: number | null
  remainingLockTimeMs: number | null
} {
  const record = lockoutStore[username]
  if (!record) {
    return {
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
      remainingLockTimeMs: null,
    }
  }

  const now = Date.now()
  let remainingLockTimeMs: number | null = null
  let isLocked = false

  if (record.lockedUntil) {
    if (now > record.lockedUntil) {
      // 锁定已过期
      delete lockoutStore[username]
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        remainingLockTimeMs: null,
      }
    }
    isLocked = true
    remainingLockTimeMs = record.lockedUntil - now
  }

  return {
    failedAttempts: record.failedAttempts,
    isLocked,
    lockedUntil: record.lockedUntil,
    remainingLockTimeMs,
  }
}

export type RateLimitType = keyof typeof DEFAULT_CONFIG
