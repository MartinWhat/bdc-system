import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { auth } from '@/lib/auth/better-auth'

interface AuthSessionPayload {
  user?: {
    id?: string
    username?: string
    realName?: string
    status?: string
    twoFactorEnabled?: boolean
  }
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
const PUBLIC_PATHS = ['/api/auth']

/**
 * 路由级角色拦截映射表
 * 键为路径前缀，值为允许访问的角色列表
 */
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/api/users': ['ADMIN'],
  '/api/roles': ['ADMIN'],
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

  // 仅通过 Better Auth session cookie 鉴权
  const betterAuthSessionCookie = getSessionCookie(request)
  if (!betterAuthSessionCookie) {
    console.log('[Middleware] No token provided for:', pathname)
    return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    const session = (await auth.api.getSession({
      headers: request.headers,
    })) as AuthSessionPayload | null

    let payload: {
      sub: string
      username: string
      roles: string[]
      permissions: string[]
      status?: string
    } | null = null

    if (session?.user?.id) {
      payload = {
        sub: session.user.id,
        username: session.user.username || '',
        roles: session.roles || [],
        permissions: session.permissions || [],
        status: session.user.status,
      }
    }

    if (!payload?.sub) {
      return NextResponse.json({ error: '无效的认证令牌', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    if (payload.status && payload.status !== 'ACTIVE') {
      return NextResponse.json({ error: '用户已被禁用', code: 'USER_DISABLED' }, { status: 403 })
    }

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
        break
      }
    }

    // 将用户信息注入到下游请求头，供 API Route 读取
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', payload.sub || '')
    requestHeaders.set('x-username', encodeURIComponent(payload.username || ''))
    requestHeaders.set('x-user-roles', encodeURIComponent(JSON.stringify(payload.roles || [])))
    requestHeaders.set(
      'x-user-permissions',
      encodeURIComponent(JSON.stringify(payload.permissions || [])),
    )

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch (error) {
    console.error('[Middleware] Auth service error:', error)
    return NextResponse.json({ error: '认证服务错误', code: 'AUTH_ERROR' }, { status: 500 })
  }
}

/**
 * 从请求头中获取用户信息（由 Middleware 注入）
 */
export function getUserFromRequest(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const username = request.headers.get('x-username')
  const rolesHeader = request.headers.get('x-user-roles')
  const permissionsHeader = request.headers.get('x-user-permissions')

  let parsedRoles: string[] = []
  let parsedPermissions: string[] = []

  if (rolesHeader) {
    try {
      parsedRoles = JSON.parse(decodeURIComponent(rolesHeader))
    } catch {
      parsedRoles = []
    }
  }

  if (permissionsHeader) {
    try {
      parsedPermissions = JSON.parse(decodeURIComponent(permissionsHeader))
    } catch {
      parsedPermissions = []
    }
  }

  return {
    userId: userId || undefined,
    username: username ? decodeURIComponent(username) : undefined,
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
