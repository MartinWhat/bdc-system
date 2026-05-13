/**
 * 用户详情/更新/禁用 API
 * GET    /api/users/[id] - 获取用户详情
 * PUT    /api/users/[id] - 更新用户
 * DELETE /api/users/[id] - 禁用用户
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField, decryptSensitiveField } from '@/lib/gm-crypto'
import { logOperation } from '@/lib/log'
import { updateUserSchema } from '../schema'
import { getUserFromRequest, isAdmin } from '@/lib/middleware/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const user = await prisma.sysUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        realName: true,
        fixedPhone: true,
        email: true,
        avatar: true,
        status: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    if (user.fixedPhone) {
      user.fixedPhone = await decryptSensitiveField(user.fixedPhone)
    }

    return NextResponse.json({
      success: true,
      data: user,
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ error: '获取用户详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = updateUserSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { realName, fixedPhone, phone, email, status, twoFactorEnabled, roleIds } =
      validationResult.data
    const { userId: currentUserId } = getUserFromRequest(request)

    // 检查用户是否存在
    const existingUser = await prisma.sysUser.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (realName !== undefined) updateData.realName = realName
    if (email !== undefined) updateData.email = email || `${existingUser.username}@system.local`
    if (status !== undefined) updateData.status = status
    if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = twoFactorEnabled

    // 更新加密字段
    if (phone !== undefined) {
      const result = await encryptSensitiveField(phone)
      updateData.phone = result.encrypted
    }

    if (fixedPhone !== undefined) {
      if (fixedPhone) {
        const result = await encryptSensitiveField(fixedPhone)
        updateData.fixedPhone = result.encrypted
      } else {
        updateData.fixedPhone = null
      }
    }

    // 使用事务更新用户信息和角色关联
    await prisma.$transaction(async (tx) => {
      await tx.sysUser.update({
        where: { id },
        data: updateData,
      })

      // 更新角色关联
      if (roleIds !== undefined) {
        await tx.userRole.deleteMany({
          where: { userId: id },
        })

        if (roleIds.length > 0) {
          await tx.userRole.createMany({
            data: roleIds.map((roleId) => ({
              userId: id,
              roleId,
            })),
          })
        }
      }
    })

    // 重新查询用户及其角色
    const userWithRoles = await prisma.sysUser.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (userWithRoles?.fixedPhone) {
      userWithRoles.fixedPhone = await decryptSensitiveField(userWithRoles.fixedPhone)
    }

    const changedFields = [
      realName !== undefined ? '真实姓名' : null,
      email !== undefined ? '邮箱' : null,
      status !== undefined ? '状态' : null,
      twoFactorEnabled !== undefined ? '双重验证' : null,
      phone !== undefined ? '手机号' : null,
      fixedPhone !== undefined ? '固定电话' : null,
      roleIds !== undefined ? '角色' : null,
    ]
      .filter(Boolean)
      .join('、')

    try {
      await logOperation({
        userId: currentUserId || 'unknown',
        action: 'UPDATE',
        module: 'USER',
        description: `更新用户 ${existingUser.username}${
          changedFields ? `（${changedFields}）` : ''
        }`,
        status: 'SUCCESS',
      })
    } catch (error) {
      console.error('Log user update error:', error)
    }

    return NextResponse.json({
      success: true,
      data: userWithRoles,
    })
  } catch (error: unknown) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: '更新用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // 授权校验：只有管理员可以禁用用户
    if (!isAdmin(request)) {
      return NextResponse.json({ error: '需要管理员权限', code: 'FORBIDDEN' }, { status: 403 })
    }

    // 检查用户是否存在
    const existingUser = await prisma.sysUser.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    // 不能禁用自己（从中间件注入的请求头获取当前用户 ID）
    const { userId: currentUserId } = getUserFromRequest(request)
    if (id === currentUserId) {
      return NextResponse.json(
        { error: '不能禁用自己的账号', code: 'CANNOT_DISABLE_SELF' },
        { status: 403 },
      )
    }

    // 禁用用户（软删除）
    await prisma.sysUser.update({
      where: { id },
      data: { status: 'DISABLED' },
    })

    try {
      await logOperation({
        userId: currentUserId || 'unknown',
        action: 'DISABLE',
        module: 'USER',
        description: `禁用用户 ${existingUser.username}`,
        status: 'SUCCESS',
      })
    } catch (error) {
      console.error('Log user disable error:', error)
    }

    return NextResponse.json({
      success: true,
      message: '用户已禁用',
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: '禁用用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
