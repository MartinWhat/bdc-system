/**
 * POST /api/logout
 * 用户登出接口
 */

import { NextRequest, NextResponse } from 'next/server'
import { destroySession, destroyAllUserSessions } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    // 获取令牌
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const token = authHeader.slice(7)

    // 获取用户ID（由中间件注入）
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json({ error: '无效的用户信息', code: 'INVALID_USER' }, { status: 401 })
    }

    // 销毁当前会话
    await destroySession(token)

    // 可选：销毁所有会话（安全起见）
    // await destroyAllUserSessions(userId)

    return NextResponse.json({
      success: true,
      message: '登出成功',
    })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: '登出失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
