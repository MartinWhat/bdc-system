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

interface JWTPayload {
  sub: string
  username: string
  roles?: string[]
  permissions?: string[]
  exp?: number
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
 * 路由级角色拦截映射表
 * 键为路径前缀，值为允许访问的角色列表
 */
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/api/users': ['ADMIN'],
  '/api/roles': ['ADMIN'],
  '/api/kms': ['ADMIN'],
  '/api/towns': ['ADMIN', 'TOWN_ADMIN'],
  '/api/villages': ['ADMIN', 'TOWN_ADMIN', 'VILLAGE_ADMIN'],
  '/api/notifications/manage': ['ADMIN'],
  '/api/logs': ['ADMIN'],
  '/api/bdc': ['ADMIN', 'BDC_MANAGER'],
  '/api/collective': ['ADMIN', 'COLLECTIVE_MANAGER'],
  '/api/contacts': ['ADMIN', 'CONTACT_MANAGER'],
  '/api/stats': ['ADMIN', 'STATS_VIEWER'],
  '/api/objection': ['ADMIN', 'OBJECTION_HANDLER'],
  '/api/receive': ['ADMIN', 'RECEIVE_CLERK'],
  '/api/upload': ['ADMIN', 'BDC_MANAGER', 'COLLECTIVE_MANAGER', 'CONTACT_MANAGER'],
  '/api/permissions': ['ADMIN'],
}

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
  const jwtKey = process.env.JWT_SECRET_KEY
  if (!jwtKey) {
    throw new Error('JWT_SECRET_KEY environment variable is required')
  }

  let payload: JWTPayload | null
  try {
    // 验证 token
    payload = await verifyJWT(token, jwtKey)

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
  } catch (error) {
    console.error('[Middleware] Auth service error:', error)
    return NextResponse.json({ error: '认证服务错误', code: 'AUTH_ERROR' }, { status: 500 })
  }

  // 使用 Object.defineProperty 直接附加到 request 对象（避免响应头丢失问题）
  // 注意：必须在 NextResponse.next() 之前设置，否则后续 handler 无法访问
  Object.defineProperty(request, 'userId', {
    value: payload.sub,
    writable: false,
    enumerable: true,
  })
  Object.defineProperty(request, 'username', {
    value: payload.username,
    writable: false,
    enumerable: true,
  })
  Object.defineProperty(request, 'roles', {
    value: payload.roles || [],
    writable: false,
    enumerable: true,
  })
  Object.defineProperty(request, 'permissions', {
    value: payload.permissions || [],
    writable: false,
    enumerable: true,
  })

  // 同时设置到 header 中（确保 API Route 可以通过 headers.get 读取）
  const response = NextResponse.next()
  response.headers.set('x-user-id', payload.sub || '')
  response.headers.set('x-username', encodeURIComponent(payload.username || ''))
  response.headers.set('x-user-roles', encodeURIComponent(JSON.stringify(payload.roles || [])))
  response.headers.set(
    'x-user-permissions',
    encodeURIComponent(JSON.stringify(payload.permissions || [])),
  )

  // 路由级角色拦截检查
  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(routePrefix)) {
      const userRoles = payload.roles || []
      const hasRole = userRoles.some((role: string) => allowedRoles.includes(role))
      if (!hasRole) {
        console.log(
          `[Middleware] Role check failed for ${pathname}: required ${allowedRoles}, got ${userRoles}`,
        )
        return NextResponse.json(
          { error: '权限不足：需要管理员权限', code: 'FORBIDDEN' },
          { status: 403 },
        )
      }
      // 匹配到第一个规则后即退出（假设规则不重叠或按顺序优先级）
      break
    }
  }

  // 创建响应并继续处理请求
  return response
}

/**
 * 从请求中获取用户信息
 * 优先从 request 对象属性读取（中间件直接附加，可信来源）
 * 回退到从请求头读取（兼容性）
 */
export function getUserFromRequest(request: NextRequest) {
  // 优先从 request 对象属性读取（中间件直接附加，比请求头更可信）
  const userId = (request as any).userId || request.headers.get('x-user-id')
  const username = (request as any).username || request.headers.get('x-username')
  const roles = (request as any).roles || request.headers.get('x-user-roles')
  const permissions = (request as any).permissions || request.headers.get('x-user-permissions')

  let parsedRoles: string[] = []
  let parsedPermissions: string[] = []

  if (Array.isArray(roles)) {
    parsedRoles = roles
  } else if (roles) {
    try {
      parsedRoles = JSON.parse(decodeURIComponent(roles as string))
    } catch {
      parsedRoles = []
    }
  }

  if (Array.isArray(permissions)) {
    parsedPermissions = permissions
  } else if (permissions) {
    try {
      parsedPermissions = JSON.parse(decodeURIComponent(permissions as string))
    } catch {
      parsedPermissions = []
    }
  }

  return {
    userId,
    username: username ? decodeURIComponent(username as string) : undefined,
    roles: parsedRoles,
    permissions: parsedPermissions,
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
