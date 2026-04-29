/**
 * API 认证中间件
 * 从 JWT Token 获取当前用户信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from './jwt'
import { getAccessToken } from './cookies'

export interface AuthenticatedUser {
  userId: string
  username: string
  roles?: string[]
  permissions?: string[]
}

/**
 * 从请求中获取当前认证用户
 * @param request - Next.js 请求对象
 * @returns 认证用户信息或 null
 */
export async function getCurrentUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    // 优先从 Authorization header 获取 token
    const authHeader = request.headers.get('authorization')
    let token: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else {
      // 后备：从 Cookie 获取（支持 httpOnly Cookie）
      token = getAccessToken(request)
    }

    if (!token) {
      return null
    }

    // 使用环境变量中的 JWT 密钥（与 Middleware 保持一致）
    const jwtKey = process.env.JWT_SECRET_KEY
    if (!jwtKey) {
      throw new Error('JWT_SECRET_KEY environment variable is required')
    }

    // 验证 token
    const payload = await verifyJWT(token, jwtKey)
    if (!payload) {
      return null
    }

    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
    }
  } catch (error) {
    console.error('Get current user error:', error)
    return null
  }
}

/**
 * 获取当前用户 ID 的辅助函数
 * @param request - Next.js 请求对象
 * @returns 用户 ID 或 null
 */
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  const user = await getCurrentUser(request)
  return user?.userId || null
}

/**
 * 认证中间件装饰器
 * @param handler - 处理函数
 * @param requiredPermissions - 所需权限（可选）
 */
export function withAuth<T extends NextRequest>(
  handler: (request: T, user: AuthenticatedUser) => Promise<NextResponse>,
  requiredPermissions?: string[],
) {
  return async function authenticatedHandler(request: T): Promise<NextResponse> {
    const user = await getCurrentUser(request)

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
