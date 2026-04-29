/**
 * GET /api/auth/me
 * 获取当前用户信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserPermissions, getUserRoles } from '@/lib/auth/user-service'
import { withPermission } from '@/lib/api/withPermission'

// GET /api/auth/me - 获取当前用户信息
async function getCurrentUserInfoHandler(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json({ error: '未提供认证令牌', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 获取用户信息
    const user = await prisma.sysUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        avatar: true,
        twoFactorEnabled: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    // 获取角色和权限
    const roles = await getUserRoles(userId)
    const permissions = await getUserPermissions(userId)

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        roles,
        permissions,
      },
    })
  } catch (error) {
    console.error('Get user info error:', error)
    return NextResponse.json({ error: '获取用户信息失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission()(getCurrentUserInfoHandler)
