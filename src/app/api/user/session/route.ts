/**
 * POST /api/user/session
 * 解密 user_info cookie 并返回用户信息
 * 同时作为 httpOnly JWT cookie 的后备读取方案
 */

import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/auth/crypto'
import { getCurrentUser } from '@/lib/auth/middleware'
import { getAccessToken, encodeUserInfo, USER_COOKIE } from '@/lib/auth/cookies'

export async function POST(request: NextRequest) {
  try {
    // 方案一：尝试解密 cookie 中的 user_info
    const encryptedData = (await request.json().catch(() => ({}))).encryptedData as
      | string
      | undefined

    if (encryptedData) {
      const userInfo = decrypt<Record<string, unknown>>(encryptedData)
      if (userInfo) {
        return NextResponse.json({ success: true, data: userInfo })
      }
    }

    // 方案二：通过 httpOnly JWT cookie 获取（向后兼容 / 降级方案）
    const token = getAccessToken(request)
    if (!token) {
      return NextResponse.json({ error: '未登录', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '认证已过期', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 通过 JWT 成功获取后，回写加密的 user_info cookie
    const response = NextResponse.json({
      success: true,
      data: {
        id: user.userId,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
      },
    })

    const encoded = encodeUserInfo({
      id: user.userId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    })

    response.headers.append(
      'Set-Cookie',
      `${USER_COOKIE}=${encoded}; Path=/; SameSite=strict; Max-Age=${60 * 60 * 24 * 7}`,
    )

    return response
  } catch (error) {
    console.error('Session decryption error:', error)
    return NextResponse.json({ error: '服务器错误', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
