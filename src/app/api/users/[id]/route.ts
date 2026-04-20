/**
 * 用户详情/更新/删除 API
 * GET    /api/users/[id] - 获取用户详情
 * PUT    /api/users/[id] - 更新用户
 * DELETE /api/users/[id] - 删除用户
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'
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

    const { realName, idCard, phone, email, status, twoFactorEnabled, roleIds } =
      validationResult.data

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
    if (email !== undefined) updateData.email = email
    if (status !== undefined) updateData.status = status
    if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = twoFactorEnabled

    // 更新加密字段
    if (idCard !== undefined) {
      const result = await encryptSensitiveField(idCard)
      updateData.idCard = result.encrypted
      updateData.idCardHash = result.hash
    }

    if (phone !== undefined) {
      const result = await encryptSensitiveField(phone)
      updateData.phone = result.encrypted
      updateData.phoneHash = result.hash
    }

    // 更新用户
    const user = await prisma.sysUser.update({
      where: { id },
      data: updateData,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    // 更新角色关联
    if (roleIds !== undefined) {
      // 删除旧的角色关联
      await prisma.userRole.deleteMany({
        where: { userId: id },
      })

      // 创建新的角色关联
      if (roleIds.length > 0) {
        await Promise.all(
          roleIds.map((roleId) =>
            prisma.userRole.create({
              data: {
                userId: id,
                roleId,
              },
            }),
          ),
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: user,
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

    // 授权校验：只有管理员可以删除用户
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

    // 不能删除自己（从中间件注入的请求头获取当前用户 ID）
    const { userId: currentUserId } = getUserFromRequest(request)
    if (id === currentUserId) {
      return NextResponse.json(
        { error: '不能删除自己的账号', code: 'CANNOT_DELETE_SELF' },
        { status: 403 },
      )
    }

    // 删除用户（软删除：禁用）
    await prisma.sysUser.update({
      where: { id },
      data: { status: 'DISABLED' },
    })

    return NextResponse.json({
      success: true,
      message: '用户已删除',
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: '删除用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
