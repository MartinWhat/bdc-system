/**
 * JWT 认证中间件
 * 验证请求中的 JWT 令牌并注入用户信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, extractTokenFromHeader } from '@/lib/auth'
import { getActiveKey } from '@/lib/kms'

export interface AuthenticatedRequest extends NextRequest {
  userId?: string
  username?: string
  roles?: string[]
  permissions?: string[]
}

/**
 * 需要认证的路径前缀
 */
const PROTECTED_PATHS = ['/api/']

/**
 * JWT 认证中间件
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname

  // 检查是否需要认证
  const isProtected = PROTECTED_PATHS.some(
    (prefix) => pathname.startsWith(prefix) && !pathname.startsWith('/api/login'),
  )

  if (!isProtected) {
    return null // 不需要认证，继续处理
  }

  // 提取令牌
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader || undefined)

  if (!token) {
    return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // 获取 JWT 密钥
  try {
    const jwtKeyRecord = await getActiveKey('JWT_SECRET')

    if (!jwtKeyRecord || !jwtKeyRecord.keyValue) {
      console.error('[Middleware] JWT key not found or empty')
      return NextResponse.json(
        { error: '认证服务配置错误', code: 'AUTH_CONFIG_ERROR' },
        { status: 500 },
      )
    }

    // 验证 token
    const payload = verifyJWT(token, jwtKeyRecord.keyValue)

    if (!payload) {
      console.log('[Middleware] Token verification failed')
      return NextResponse.json({ error: '无效的认证令牌', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    // 创建响应并注入用户信息到请求头
    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.sub)
    response.headers.set('x-username', payload.username)
    response.headers.set('x-user-roles', JSON.stringify(payload.roles || []))
    response.headers.set('x-user-permissions', JSON.stringify(payload.permissions || []))

    return response
  } catch (error) {
    console.error('[Middleware] Auth service error:', error)
    return NextResponse.json({ error: '认证服务错误', code: 'AUTH_ERROR' }, { status: 500 })
  }
}

/**
 * 从请求中获取用户信息
 */
export function getUserFromRequest(request: NextRequest) {
  return {
    userId: request.headers.get('x-user-id'),
    username: request.headers.get('x-username'),
    roles: JSON.parse(request.headers.get('x-user-roles') || '[]'),
    permissions: JSON.parse(request.headers.get('x-user-permissions') || '[]'),
  }
}
