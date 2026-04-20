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

// 内存存储（生产环境建议使用 Redis）
const store: RateLimitStore = {}

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

export type RateLimitType = keyof typeof DEFAULT_CONFIG
