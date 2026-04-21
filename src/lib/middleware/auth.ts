/**
 * JWT 认证中间件
 * 验证请求中的 JWT 令牌并注入用户信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { getAccessToken, extractTokenFromHeader } from '@/lib/auth/cookies'

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
 * 不需要认证的路径（白名单）
 */
const PUBLIC_PATHS = ['/api/login', '/api/token/refresh']

/**
 * JWT 认证中间件
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname

  // 检查是否是公开路径（不需要认证）
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path))
  if (isPublic) {
    return null // 公开路径，继续处理
  }

  // 检查是否需要认证
  const isProtected = PROTECTED_PATHS.some((prefix) => pathname.startsWith(prefix))
  if (!isProtected) {
    return null // 不需要认证，继续处理
  }

  // 提取令牌（优先 Cookie，其次 Header）
  let token = getAccessToken(request)

  if (!token) {
    // 从 Authorization Header 获取（向后兼容）
    const authHeader = request.headers.get('authorization')
    token = extractTokenFromHeader(authHeader || undefined)
  }

  if (!token) {
    console.log('[Middleware] No token provided for:', pathname)
    return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // 使用环境变量中的 JWT 密钥（避免在 Middleware 中使用 Prisma）
  const jwtKey = process.env.JWT_SECRET_KEY || 'default-jwt-secret-key-change-in-production'

  try {
    // 验证 token
    const payload = verifyJWT(token, jwtKey)

    if (!payload) {
      console.log(
        '[Middleware] Token verification failed for:',
        pathname,
        'Token prefix:',
        token.substring(0, 20),
      )
      return NextResponse.json({ error: '无效的认证令牌', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    console.log('[Middleware] Token verified successfully for user:', payload.username)

    // 创建响应并注入用户信息到请求头（使用 encodeURIComponent 处理中文等非 ASCII 字符）
    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.sub)
    response.headers.set('x-username', encodeURIComponent(payload.username))
    response.headers.set('x-user-roles', encodeURIComponent(JSON.stringify(payload.roles || [])))
    response.headers.set(
      'x-user-permissions',
      encodeURIComponent(JSON.stringify(payload.permissions || [])),
    )

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
  const userId = request.headers.get('x-user-id')
  const username = request.headers.get('x-username')
  const roles = request.headers.get('x-user-roles')
  const permissions = request.headers.get('x-user-permissions')

  return {
    userId,
    username: username ? decodeURIComponent(username) : undefined,
    roles: roles ? (JSON.parse(decodeURIComponent(roles)) as string[]) : [],
    permissions: permissions ? (JSON.parse(decodeURIComponent(permissions)) as string[]) : [],
  }
}

/**
 * 检查用户是否有指定角色
 * @param request - 请求对象
 * @param requiredRoles - 需要的角色列表
 * @returns 是否有指定角色
 */
export function hasAnyRole(request: NextRequest, requiredRoles: string[]): boolean {
  const { roles } = getUserFromRequest(request)
  return roles.some((role) => requiredRoles.includes(role))
}

/**
 * 检查用户是否是管理员
 * @param request - 请求对象
 * @returns 是否是管理员
 */
export function isAdmin(request: NextRequest): boolean {
  return hasAnyRole(request, ['ADMIN'])
}
