/**
 * POST /api/token/refresh
 * 使用 Refresh Token 换取新的 Access Token（双 Token 机制）
 */

import { NextRequest, NextResponse } from 'next/server'
import { signJWT } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateRefreshToken, rotateRefreshToken } from '@/lib/session'
import { setAuthCookies, getRefreshToken } from '@/lib/auth/cookies'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { randomBytes } from 'crypto'

// Token 配置
const ACCESS_TOKEN_EXPIRES_IN = 3600 // 1 小时（秒）

/**
 * 生成新的 Refresh Token
 */
function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    // Cookie 模式下从 Cookie 读取 Refresh Token
    let refreshToken = getRefreshToken(request)

    // 向后兼容：如果 Cookie 中没有，尝试从请求体读取
    if (!refreshToken) {
      const body = await request.json().catch(() => ({}))
      refreshToken = body.refreshToken
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: '未提供 Refresh Token', code: 'MISSING_REFRESH_TOKEN' },
        { status: 400 },
      )
    }

    // 速率限制检查（基于 IP）
    const clientIp = getClientIdentifier(request)
    const rateLimit = checkRateLimit(clientIp, 'TOKEN_REFRESH')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: '请求过于频繁，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 },
      )
    }

    // 验证 Refresh Token
    const session = await validateRefreshToken(refreshToken)

    if (!session) {
      return NextResponse.json(
        { error: 'Refresh Token 无效或已过期，请重新登录', code: 'INVALID_REFRESH_TOKEN' },
        { status: 401 },
      )
    }

    // 获取用户信息
    const user = await prisma.sysUser.findUnique({
      where: { id: session.userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: '用户不存在或已被禁用', code: 'USER_DISABLED' },
        { status: 403 },
      )
    }

    // 提取角色和权限
    const roles = user.roles.map((ur) => ur.role.name)
    const permissions = Array.from(
      new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    )

    // 使用环境变量中的 JWT 密钥（与 Middleware 保持一致）
    const jwtKey = process.env.JWT_SECRET_KEY
    if (!jwtKey) {
      throw new Error('JWT_SECRET_KEY environment variable is required')
    }

    // 签发新的 Access Token
    const newAccessToken = await signJWT(
      {
        sub: user.id,
        username: user.username,
        roles,
        permissions,
      },
      jwtKey,
      ACCESS_TOKEN_EXPIRES_IN,
    )

    // 轮换 Refresh Token（安全增强：每次刷新后更换新 Token）
    const newRefreshToken = generateRefreshToken()
    const updatedSession = await rotateRefreshToken(refreshToken, newRefreshToken)

    if (!updatedSession) {
      // 轮换失败，可能是并发请求或 token 已使用
      return NextResponse.json(
        { error: 'Refresh Token 已失效，请重新登录', code: 'TOKEN_ROTATION_FAILED' },
        { status: 401 },
      )
    }

    const response = NextResponse.json({
      success: true,
      data: {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    })

    // 设置新的 Cookie
    setAuthCookies(response, newAccessToken, newRefreshToken, {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      avatar: user.avatar,
      roles,
      permissions,
    })

    return response
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: '刷新失败，请稍后重试', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
