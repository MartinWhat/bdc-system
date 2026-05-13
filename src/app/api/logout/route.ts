/**
 * POST /api/logout
 * 用户登出接口
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, appendSetCookieHeaders } from '@/lib/auth/better-auth'
import { clearAuthCookies } from '@/lib/auth/cookies'
import { recordAuthLogoutAudit } from '@/lib/auth/audit'

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    let signOutResponse: Response | null = null
    try {
      signOutResponse = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      })
    } catch (error) {
      console.warn('Better Auth signOut failed, continuing with local cleanup:', error)
    }

    const response = NextResponse.json({
      success: true,
      message: '登出成功',
    })

    if (signOutResponse) {
      appendSetCookieHeaders(response.headers, signOutResponse.headers)
    }

    clearAuthCookies(response)

    if (session?.user?.id) {
      await recordAuthLogoutAudit({
        userId: session.user.id,
        description: '用户登出',
        headers: request.headers,
      })
    }

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: '登出失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
