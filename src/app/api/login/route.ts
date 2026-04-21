/**
 * POST /api/login
 * 用户登录接口（双 Token 机制）
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateUserCredentials,
  updateLastLogin,
  getUserPermissions,
  getUserRoles,
} from '@/lib/auth/user-service'
import { signJWT } from '@/lib/auth'
import { createSession } from '@/lib/session'
import { logOperation } from '@/lib/log'
import { setAuthCookies } from '@/lib/auth/cookies'
import { checkRateLimit, getClientIdentifier, resetRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { randomBytes } from 'crypto'

// 请求体验证
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  // 双因素验证码（二期实现，一期暂不使用）
  twoFactorCode: z.string().optional(),
})

// Token 配置
const ACCESS_TOKEN_EXPIRES_IN = 3600 // 1 小时（秒）
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 7 // 7 天

/**
 * 生成 Refresh Token（使用加密安全的随机数）
 */
function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validationResult = loginSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { username, password } = validationResult.data

    // 速率限制检查（基于用户名）
    const loginRateLimit = checkRateLimit(username, 'LOGIN')
    if (!loginRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            loginRateLimit.resetTime > Date.now()
              ? '登录尝试次数过多，请稍后再试'
              : '登录尝试次数过多，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((loginRateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 },
      )
    }

    // 验证用户凭据
    const user = await validateUserCredentials(username, password)

    if (!user) {
      return NextResponse.json(
        { error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      )
    }

    // 检查是否启用双因素认证
    // 注意：一期暂不实现双因素认证功能，此处代码保留但不会执行
    // TODO(二期): 实现 TOTP/短信验证码校验逻辑
    if (user.twoFactorEnabled) {
      // TODO: 验证双因素验证码
      return NextResponse.json(
        {
          error: '需要双因素认证',
          code: 'TWO_FACTOR_REQUIRED',
          requiresTwoFactor: true,
        },
        { status: 403 },
      )
    }

    // 获取用户角色和权限
    const roles = await getUserRoles(user.id)
    const permissions = await getUserPermissions(user.id)

    // 使用环境变量中的 JWT 密钥（与 Middleware 保持一致）
    const jwtKey = process.env.JWT_SECRET_KEY || 'default-jwt-secret-key-change-in-production'

    // 签发 Access Token（30 分钟）
    const accessToken = signJWT(
      {
        sub: user.id,
        username: user.username,
        roles,
        permissions,
      },
      jwtKey,
      ACCESS_TOKEN_EXPIRES_IN,
    )

    // 生成 Refresh Token（7 天）
    const refreshToken = generateRefreshToken()

    // 创建会话（双 Token 机制）
    await createSession(
      user.id,
      refreshToken,
      0.5, // Access Token 30 分钟
      REFRESH_TOKEN_EXPIRES_IN_DAYS, // Refresh Token 7 天
    )

    // 更新最后登录时间
    await updateLastLogin(user.id)

    // 记录登录日志
    await logOperation({
      userId: user.id,
      action: 'LOGIN',
      module: 'AUTH',
      description: `用户 ${user.username} 登录成功`,
      status: 'SUCCESS',
    })

    // 登录成功后重置速率限制
    resetRateLimit(username, 'LOGIN')

    // 返回登录成功响应（Token 已通过 httpOnly Cookie 存储）
    const response = NextResponse.json({
      success: true,
      data: {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: {
          id: user.id,
          username: user.username,
          realName: user.realName,
          email: user.email,
          avatar: user.avatar,
          roles,
          permissions,
        },
      },
    })

    // 设置 httpOnly Cookie（安全增强：Token 不暴露在响应体中）
    setAuthCookies(response, accessToken, refreshToken, {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      avatar: user.avatar,
      roles,
      permissions,
    })

    return response
  } catch (error: unknown) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'

    // 登录失败不记录 OperationLog（因为 userId 是外键，必须存在）
    // 改用 console.error 记录

    if (errorMessage === '用户已被禁用') {
      return NextResponse.json(
        { error: '用户已被禁用，请联系管理员', code: 'USER_DISABLED' },
        { status: 403 },
      )
    }

    return NextResponse.json(
      { error: '登录失败，请稍后重试', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
