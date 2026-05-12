/**
 * GET /api/auth/me
 * 获取当前用户信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/better-auth'
import { withPermission } from '@/lib/api/withPermission'

// GET /api/auth/me - 获取当前用户信息
async function getCurrentUserInfoHandler(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (session?.user?.id) {
      if (session.user.status && session.user.status !== 'ACTIVE') {
        return NextResponse.json(
          { error: '用户已被禁用，请联系管理员', code: 'USER_DISABLED' },
          { status: 403 },
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          id: session.user.id,
          username: session.user.username || session.user.name || '',
          realName: session.user.realName || session.user.name || '',
          email: session.user.email,
          avatar: session.user.avatar || session.user.image || null,
          twoFactorEnabled: session.user.twoFactorEnabled ?? false,
          status: session.user.status || 'ACTIVE',
          lastLoginAt: session.user.lastLoginAt || null,
          createdAt: session.user.createdAt,
          roles: session.roles || [],
          permissions: session.permissions || [],
        },
      })
    }

    return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
  } catch (error) {
    console.error('Get user info error:', error)
    return NextResponse.json({ error: '获取用户信息失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission()(getCurrentUserInfoHandler)
