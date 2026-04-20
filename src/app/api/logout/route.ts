/**
 * POST /api/logout
 * 用户登出接口（双 Token 机制）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sm3Hash } from '@/lib/gm-crypto'
import { getRefreshToken } from '@/lib/auth/cookies'

export async function POST(request: NextRequest) {
  try {
    // 获取 Refresh Token（从 httpOnly Cookie 读取）
    const refreshToken = getRefreshToken(request)

    // 获取用户 ID（由中间件注入）
    const userId = request.headers.get('x-user-id')

    // 销毁 Refresh Token 对应的会话（双 Token 机制）
    if (refreshToken) {
      const refreshTokenHash = sm3Hash(refreshToken)
      await prisma.sysSession.deleteMany({
        where: { refreshTokenHash },
      })
    } else if (userId) {
      // 如果没有 Refresh Token，但有用户 ID，销毁该用户的所有会话
      await prisma.sysSession.deleteMany({
        where: { userId },
      })
    }

    return NextResponse.json({
      success: true,
      message: '登出成功',
    })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: '登出失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
