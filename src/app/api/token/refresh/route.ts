/**
 * POST /api/token/refresh
 * 刷新 JWT Token
 */

import { NextRequest, NextResponse } from 'next/server'
import { signJWT, verifyJWT, extractTokenFromHeader } from '@/lib/auth'
import { getActiveKey } from '@/lib/kms'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // 从请求头获取旧 token
    const authHeader = request.headers.get('authorization')
    const oldToken = extractTokenFromHeader(authHeader || undefined)

    if (!oldToken) {
      return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 获取 JWT 密钥
    const jwtKeyRecord = await getActiveKey('JWT_SECRET')
    if (!jwtKeyRecord || !jwtKeyRecord.keyValue) {
      return NextResponse.json(
        { error: '认证服务配置错误', code: 'AUTH_CONFIG_ERROR' },
        { status: 500 },
      )
    }

    // 验证旧 token（即使过期也能解析出用户信息）
    const payload = verifyJWT(oldToken, jwtKeyRecord.keyValue)

    // 如果 token 仍然有效，直接返回
    if (payload) {
      return NextResponse.json({
        success: true,
        data: {
          token: oldToken,
          expiresIn: 3600,
        },
      })
    }

    // Token 已过期，尝试从会话中恢复用户信息
    // 解析过期的 token 获取用户 ID
    try {
      const parts = oldToken.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid token format')
      }

      const encodedPayload = Buffer.from(parts[1], 'base64').toString('utf-8')
      const expiredPayload = JSON.parse(encodedPayload)

      const userId = expiredPayload.sub

      // 检查会话是否仍然有效
      const session = await prisma.sysSession.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
      })

      if (!session) {
        return NextResponse.json(
          { error: '会话已过期，请重新登录', code: 'SESSION_EXPIRED' },
          { status: 401 },
        )
      }

      // 获取用户信息
      const user = await prisma.sysUser.findUnique({
        where: { id: userId },
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

      // 签发新 token
      const newToken = signJWT(
        {
          sub: user.id,
          username: user.username,
          roles,
          permissions,
        },
        jwtKeyRecord.keyValue,
        3600, // 1 小时
      )

      return NextResponse.json({
        success: true,
        data: {
          token: newToken,
          expiresIn: 3600,
        },
      })
    } catch (error) {
      console.error('Token refresh error:', error)
      return NextResponse.json({ error: '无效的认证令牌', code: 'INVALID_TOKEN' }, { status: 401 })
    }
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: '刷新失败，请稍后重试', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
