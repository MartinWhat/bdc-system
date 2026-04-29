/**
 * 速率限制模块
 * 基于 IP 和用户名实现速率限制，防止暴力破解和 DoS 攻击
 * 支持内存存储（单实例）和 Redis 存储（多实例/serverless）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRedisStore, RedisRateLimitStore } from './rate-limit-redis'

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

// 内存存储（单实例部署使用）
// 注意：内存存储在 serverless或多实例部署时不生效，限流可被绕过
// 生产环境建议配置 REDIS_URL 使用 Redis 存储
const memoryStore: RateLimitStore = {}

// 账户锁定存储（独立管理）
const memoryLockoutStore: AccountLockoutStore = {}

// 账户锁定配置
const ACCOUNT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 5, // 连续失败 5 次后锁定
  lockoutDurationMs: 15 * 60 * 1000, // 锁定 15 分钟
  resetFailedAttemptsAfterMs: 30 * 60 * 1000, // 30 分钟无失败后重置计数
}

// Redis 存储实例（懒加载）
let redisStoreInstance: RedisRateLimitStore | null = null

/**
 * 获取存储实例（优先 Redis）
 */
async function getStore(): Promise<{
  type: 'redis' | 'memory'
  store: RedisRateLimitStore | null
}> {
  if (process.env.REDIS_URL && !redisStoreInstance) {
    redisStoreInstance = await getRedisStore()
  }

  if (redisStoreInstance && redisStoreInstance.isConnected()) {
    return { type: 'redis', store: redisStoreInstance }
  }

  return { type: 'memory', store: null }
}

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

// 清理过期记录的间隔（毫秒）
const CLEANUP_INTERVAL = 60 * 1000 // 1 分钟

/**
 * 检查并更新速率限制（同步版本，使用内存存储）
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

  const record = memoryStore[key]

  // 没有记录或已过期，创建新记录
  if (!record || now > record.resetTime) {
    memoryStore[key] = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetTime: memoryStore[key].resetTime,
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
 * 检查并更新速率限制（异步版本，优先使用 Redis）
 * @param identifier - 标识符（IP 地址或用户名）
 * @param type - 速率限制类型
 * @returns 是否允许请求
 */
export async function checkRateLimitAsync(
  identifier: string,
  type: keyof typeof DEFAULT_CONFIG = 'GENERAL',
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const { type: storeType, store } = await getStore()

  // Redis 存储
  if (storeType === 'redis' && store) {
    const config = DEFAULT_CONFIG[type]
    const result = await store.increment(identifier, config.maxAttempts, config.windowMs)
    return {
      allowed: result.allowed,
      remaining: Math.max(0, config.maxAttempts - result.count),
      resetTime: result.resetTime,
    }
  }

  // 内存存储（后备）
  return checkRateLimit(identifier, type)
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
      // 使用异步版本（优先 Redis）
      const result = await checkRateLimitAsync(identifier, type)

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
 * 清理过期记录（内存存储）
 */
function cleanupExpiredRecords() {
  const now = Date.now()
  for (const key in memoryStore) {
    if (memoryStore[key].resetTime < now) {
      delete memoryStore[key]
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
export async function resetRateLimit(
  identifier: string,
  type: keyof typeof DEFAULT_CONFIG = 'LOGIN',
) {
  // 重置 Redis 存储
  const { store } = await getStore()
  if (store) {
    await store.reset(identifier)
  }

  // 同时重置内存存储
  const key = generateKey(identifier, type)
  delete memoryStore[key]
}

/**
 * 检查账户是否被锁定
 * @param username - 用户名
 * @returns 是否被锁定及锁定截止时间
 */
export async function isAccountLocked(
  username: string,
): Promise<{ locked: boolean; lockedUntil: number | null }> {
  // 优先检查 Redis
  const { store } = await getStore()
  if (store) {
    const record = await store.getLockout(username)
    if (!record) {
      return { locked: false, lockedUntil: null }
    }

    if (record.lockedUntil && Date.now() > record.lockedUntil) {
      await store.deleteLockout(username)
      return { locked: false, lockedUntil: null }
    }

    return { locked: !!record.lockedUntil, lockedUntil: record.lockedUntil }
  }

  // 内存存储（后备）
  const record = memoryLockoutStore[username]
  if (!record) {
    return { locked: false, lockedUntil: null }
  }

  if (record.lockedUntil && Date.now() > record.lockedUntil) {
    delete memoryLockoutStore[username]
    return { locked: false, lockedUntil: null }
  }

  return { locked: true, lockedUntil: record.lockedUntil }
}

/**
 * 记录登录失败
 * @param username - 用户名
 */
export async function recordLoginFailure(username: string): Promise<void> {
  const now = Date.now()

  // Redis 存储
  const { store } = await getStore()
  if (store) {
    const existing = await store.getLockout(username)
    if (!existing) {
      await store.setLockout(
        username,
        {
          failedAttempts: 1,
          lockedUntil: null,
          lastFailedAt: now,
        },
        ACCOUNT_LOCKOUT_CONFIG.resetFailedAttemptsAfterMs,
      )
      return
    }

    // 检查是否需要重置失败计数
    if (now - existing.lastFailedAt > ACCOUNT_LOCKOUT_CONFIG.resetFailedAttemptsAfterMs) {
      await store.setLockout(
        username,
        {
          failedAttempts: 1,
          lockedUntil: null,
          lastFailedAt: now,
        },
        ACCOUNT_LOCKOUT_CONFIG.resetFailedAttemptsAfterMs,
      )
      return
    }

    const newFailedAttempts = existing.failedAttempts + 1
    const lockedUntil =
      newFailedAttempts >= ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts
        ? now + ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs
        : null

    await store.setLockout(
      username,
      {
        failedAttempts: newFailedAttempts,
        lockedUntil,
        lastFailedAt: now,
      },
      ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs,
    )
    return
  }

  // 内存存储（后备）
  const record = memoryLockoutStore[username]

  if (!record) {
    memoryLockoutStore[username] = {
      failedAttempts: 1,
      lockedUntil: null,
      lastFailedAt: now,
    }
    return
  }

  if (now - record.lastFailedAt > ACCOUNT_LOCKOUT_CONFIG.resetFailedAttemptsAfterMs) {
    record.failedAttempts = 1
    record.lastFailedAt = now
    record.lockedUntil = null
    return
  }

  record.failedAttempts++
  record.lastFailedAt = now

  if (record.failedAttempts >= ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts) {
    record.lockedUntil = now + ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs
  }
}

/**
 * 清除登录失败记录（登录成功后调用）
 * @param username - 用户名
 */
export async function clearLoginFailure(username: string): Promise<void> {
  // 清除 Redis 存储
  const { store } = await getStore()
  if (store) {
    await store.deleteLockout(username)
  }

  // 清除内存存储
  delete memoryLockoutStore[username]
}
/**
 * 获取账户锁定状态
 * @param username - 用户名
 * @returns 锁定状态信息
 */
export async function getAccountLockoutStatus(username: string): Promise<{
  failedAttempts: number
  isLocked: boolean
  lockedUntil: number | null
  remainingLockTimeMs: number | null
}> {
  // 优先 Redis
  const { store } = await getStore()
  if (store) {
    const record = await store.getLockout(username)
    if (!record) {
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        remainingLockTimeMs: null,
      }
    }

    const now = Date.now()
    if (record.lockedUntil && now > record.lockedUntil) {
      await store.deleteLockout(username)
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        remainingLockTimeMs: null,
      }
    }

    return {
      failedAttempts: record.failedAttempts,
      isLocked: !!record.lockedUntil,
      lockedUntil: record.lockedUntil,
      remainingLockTimeMs: record.lockedUntil ? record.lockedUntil - now : null,
    }
  }

  // 内存存储（后备）
  const record = memoryLockoutStore[username]
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
      delete memoryLockoutStore[username]
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
