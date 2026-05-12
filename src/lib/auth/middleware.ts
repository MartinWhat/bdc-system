/**
 * API 认证中间件兼容层
 *
 * 这里保留旧接口，方便现有路由继续调用：
 * - getUserFromRequest(request) 从 '@/lib/middleware/auth' 导入
 * - withPermission() HOF 从 '@/lib/api/withPermission' 导入
 *
 * 当前认证已切换到 Better Auth session，API Route 层只读取中间件注入的信息。
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/middleware/auth'

export interface AuthenticatedUser {
  userId: string
  username: string
  roles?: string[]
  permissions?: string[]
}

/**
 * @deprecated 使用 getUserFromRequest(request) 从 '@/lib/middleware/auth' 导入
 */
export function getCurrentUser(request: NextRequest): AuthenticatedUser | null {
  const { userId, username, roles, permissions } = getUserFromRequest(request)
  if (!userId) return null
  return {
    userId: userId as string,
    username: username || '',
    roles,
    permissions,
  }
}

/**
 * @deprecated 使用 request.headers.get('x-user-id') 或 getUserFromRequest(request).userId
 */
export function getCurrentUserId(request: NextRequest): string | null {
  return request.headers.get('x-user-id') || null
}

/**
 * @deprecated 使用 withPermission() HOF 从 '@/lib/api/withPermission' 导入
 */
export function withAuth<T extends NextRequest>(
  handler: (request: T, user: AuthenticatedUser) => Promise<NextResponse>,
  requiredPermissions?: string[],
) {
  return async function authenticatedHandler(request: T): Promise<NextResponse> {
    const user = getCurrentUser(request)

    if (!user) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查权限
    if (requiredPermissions) {
      const hasPermission = requiredPermissions.every((perm) => user.permissions?.includes(perm))
      if (!hasPermission) {
        return NextResponse.json({ error: '权限不足', code: 'FORBIDDEN' }, { status: 403 })
      }
    }

    return handler(request, user)
  }
}
