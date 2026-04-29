/**
 * 权限验证高阶函数 (HOF)
 * 用于包装 API Handler，实现细粒度的权限控制
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/middleware/auth'

// 使用 any 以兼容 Next.js 15 的动态路由 [id] 参数签名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (req: NextRequest, context?: any) => Promise<NextResponse>

/**
 * 创建权限验证包装器
 * @param requiredPermissions - 需要的权限列表（满足其一即可）
 * @param requiredRoles - 需要的角色列表（满足其一即可）
 * @returns 包装后的 Handler
 */
export function withPermission(requiredPermissions: string[] = [], requiredRoles: string[] = []) {
  return function (handler: AnyHandler): AnyHandler {
    return async function (req: NextRequest, context?: unknown): Promise<NextResponse> {
      // 1. 获取用户信息
      const { permissions, roles } = getUserFromRequest(req)

      // 2. 检查角色 (如果指定了)
      if (requiredRoles.length > 0) {
        const hasRole = roles.some((role) => requiredRoles.includes(role))
        if (!hasRole) {
          return NextResponse.json(
            { error: '权限不足：需要特定角色', code: 'FORBIDDEN_ROLE' },
            { status: 403 },
          )
        }
      }

      // 3. 检查权限 (如果指定了)
      if (requiredPermissions.length > 0) {
        // 超级管理员自动拥有所有权限，直接放行
        const isSuperAdmin = roles.includes('ADMIN')
        if (!isSuperAdmin) {
          const hasPermission = requiredPermissions.some((perm) => permissions.includes(perm))
          if (!hasPermission) {
            return NextResponse.json(
              { error: '权限不足：缺少必要权限', code: 'FORBIDDEN_PERMISSION' },
              { status: 403 },
            )
          }
        }
      }

      // 4. 权限通过，执行原 Handler
      return handler(req, context)
    }
  }
}
