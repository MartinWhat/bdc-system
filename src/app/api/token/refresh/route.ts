/**
 * POST /api/token/refresh
 * 使用 Refresh Token 换取新的 Access Token（双 Token 机制）
 */

import { NextRequest, NextResponse } from 'next/server'
import { signJWT } from '@/lib/auth'
import { getActiveKey } from '@/lib/kms'
import { prisma } from '@/lib/prisma'
import { validateRefreshToken, rotateRefreshToken } from '@/lib/session'
import { randomBytes } from 'crypto'

// Token 配置
const ACCESS_TOKEN_EXPIRES_IN = 30 * 60 // 30 分钟（秒）

/**
 * 生成新的 Refresh Token
 */
function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { refreshToken } = body

    if (!refreshToken) {
      return NextResponse.json(
        { error: '未提供 Refresh Token', code: 'MISSING_REFRESH_TOKEN' },
        { status: 400 },
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

    // 获取 JWT 密钥
    const jwtKeyRecord = await getActiveKey('JWT_SECRET')
    if (!jwtKeyRecord || !jwtKeyRecord.keyValue) {
      return NextResponse.json(
        { error: '认证服务配置错误', code: 'AUTH_CONFIG_ERROR' },
        { status: 500 },
      )
    }

    // 签发新的 Access Token
    const newAccessToken = signJWT(
      {
        sub: user.id,
        username: user.username,
        roles,
        permissions,
      },
      jwtKeyRecord.keyValue,
      ACCESS_TOKEN_EXPIRES_IN,
    )

    // 轮换 Refresh Token（安全增强：每次刷新后更换新 Token）
    const newRefreshToken = generateRefreshToken()
    await rotateRefreshToken(session.id, newRefreshToken)

    return NextResponse.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: '刷新失败，请稍后重试', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
