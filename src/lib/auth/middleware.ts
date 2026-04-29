/**
 * API 认证中间件（已废弃）
 *
 * @deprecated 此文件中的函数已废弃，请使用以下替代方案：
 * - getUserFromRequest(request) 从 '@/lib/middleware/auth' 导入
 * - withPermission() HOF 从 '@/lib/api/withPermission' 导入
 *
 * Middleware 层已统一处理 JWT 验证并注入用户信息到请求头，
 * API Route 层无需再次验证 JWT。
 *
 * 保留此文件仅用于向后兼容，新代码请勿使用。
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
