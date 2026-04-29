/**
 * Redis 速率限制存储适配器
 * 用于多实例/serverless 部署环境
 *
 * 注意：redis 是可选依赖，需要手动安装：
 * npm install redis
 *
 * 如果未安装 redis 模块，此文件会优雅降级为 null 返回
 */

// Redis 客户端接口（不依赖 redis 包的类型）
interface RedisClient {
  on: (event: 'error' | 'connect', callback: (err?: Error) => void) => RedisClient
  connect: () => Promise<void>
  quit: () => Promise<void>
  get: (key: string) => Promise<string | null>
  setEx: (key: string, ttl: number, value: string) => Promise<void>
  del: (key: string) => Promise<void>
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>
}

interface RateLimitRecord {
  count: number
  resetTime: number
}

interface AccountLockoutRecord {
  failedAttempts: number
  lockedUntil: number | null
  lastFailedAt: number
}

/**
 * Redis 速率限制存储
 */
export class RedisRateLimitStore {
  private client: RedisClient | null = null
  private connected = false
  private redisUrl: string

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
  }

  /**
   * 连接 Redis
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return
    }

    try {
      // 动态导入 redis（可选依赖）
      // @ts-ignore redis 是可选依赖，可能未安装
      const redisModule = await import('redis').catch(() => null)
      if (!redisModule) {
        throw new Error('redis module not installed')
      }

      // 使用类型断言绕过编译时检查
      // @ts-ignore redis 模块可能未安装
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.client = redisModule.createClient({ url: this.redisUrl }) as RedisClient

      this.client.on('error', (err?: Error) => {
        console.error('Redis Client Error:', err)
        this.connected = false
      })

      this.client.on('connect', () => {
        this.connected = true
      })

      await this.client.connect()
    } catch (error) {
      console.error('Redis module not installed or connection failed:', error)
      this.connected = false
      this.client = null
      throw new Error('Redis is not available. Install with: npm install redis')
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.connected = false
      this.client = null
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 获取速率限制记录
   */
  async get(key: string): Promise<RateLimitRecord | null> {
    if (!this.client || !this.connected) {
      return null
    }

    const data = await this.client.get(`ratelimit:${key}`)
    if (!data) {
      return null
    }

    try {
      return JSON.parse(data) as RateLimitRecord
    } catch {
      return null
    }
  }

  /**
   * 设置速率限制记录（使用原子操作）
   */
  async set(key: string, record: RateLimitRecord, ttlMs: number): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }

    const ttlSeconds = Math.ceil(ttlMs / 1000)
    await this.client.setEx(`ratelimit:${key}`, ttlSeconds, JSON.stringify(record))
  }

  /**
   * 增加计数（原子操作）
   */
  async increment(
    key: string,
    maxAttempts: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number; resetTime: number }> {
    if (!this.client || !this.connected) {
      return { allowed: true, count: 1, resetTime: Date.now() + windowMs }
    }

    const redisKey = `ratelimit:${key}`
    const now = Date.now()
    const resetTime = now + windowMs

    const luaScript = `
      local key = KEYS[1]
      local maxAttempts = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local resetTime = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      local ttlSeconds = math.ceil(windowMs / 1000)

      local current = redis.call('GET', key)
      if current == false then
        redis.call('SET', key, 1, 'EX', ttlSeconds)
        return {1, resetTime}
      end

      local count = tonumber(current)
      local ttl = redis.call('TTL', key)
      local existingResetTime = now + (ttl * 1000)

      if count >= maxAttempts then
        return {count, existingResetTime}
      end

      local newCount = redis.call('INCR', key)
      return {newCount, existingResetTime}
    `

    const result = await this.client.eval(luaScript, {
      keys: [redisKey],
      arguments: [
        maxAttempts.toString(),
        windowMs.toString(),
        resetTime.toString(),
        now.toString(),
      ],
    })

    const [count, actualResetTime] = result as [number, number]

    return {
      allowed: count <= maxAttempts,
      count,
      resetTime: actualResetTime,
    }
  }

  /**
   * 重置速率限制记录
   */
  async reset(key: string): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }

    await this.client.del(`ratelimit:${key}`)
  }

  /**
   * 获取账户锁定记录
   */
  async getLockout(username: string): Promise<AccountLockoutRecord | null> {
    if (!this.client || !this.connected) {
      return null
    }

    const data = await this.client.get(`lockout:${username}`)
    if (!data) {
      return null
    }

    try {
      return JSON.parse(data) as AccountLockoutRecord
    } catch {
      return null
    }
  }

  /**
   * 设置账户锁定记录
   */
  async setLockout(username: string, record: AccountLockoutRecord, ttlMs: number): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }

    const ttlSeconds = Math.ceil(ttlMs / 1000)
    await this.client.setEx(`lockout:${username}`, ttlSeconds, JSON.stringify(record))
  }

  /**
   * 删除账户锁定记录
   */
  async deleteLockout(username: string): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }

    await this.client.del(`lockout:${username}`)
  }
}

// 全局 Redis 存储实例（懒加载）
let redisStore: RedisRateLimitStore | null = null

/**
 * 获取 Redis 存储实例
 * 如果 Redis 未配置或连接失败，返回 null
 */
export async function getRedisStore(): Promise<RedisRateLimitStore | null> {
  if (!process.env.REDIS_URL) {
    return null
  }

  if (!redisStore) {
    redisStore = new RedisRateLimitStore()
    try {
      await redisStore.connect()
    } catch (error) {
      console.error('Redis connection failed:', error)
      redisStore = null
      return null
    }
  }

  return redisStore
}
