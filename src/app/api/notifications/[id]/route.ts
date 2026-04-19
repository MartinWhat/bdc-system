/**
 * 通知详情/更新/删除 API
 * GET    /api/notifications/[id] - 获取通知详情
 * PUT    /api/notifications/[id] - 更新通知
 * DELETE /api/notifications/[id] - 删除通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateNotificationSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(['SYSTEM', 'POLICY', 'ANNOUNCEMENT']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  isPopup: z.boolean().optional(),
  popupStartAt: z.string().datetime().nullable().optional(),
  popupEndAt: z.string().datetime().nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().optional(),
})

// GET - 获取通知详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const notification = await prisma.notification.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            realName: true,
          },
        },
        _count: {
          select: { readRecords: true },
        },
      },
    })

    if (!notification) {
      return NextResponse.json({ error: '通知不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    console.error('Get notification error:', error)
    return NextResponse.json({ error: '获取通知详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT - 更新通知
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = updateNotificationSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const authorId = request.headers.get('x-user-id')
    if (!authorId) {
      return NextResponse.json({ error: '未登录', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 检查是否为管理员
    const user = await prisma.sysUser.findUnique({
      where: { id: authorId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const isAdmin = user.roles.some((r) => r.role.code === 'ADMIN')
    if (!isAdmin) {
      return NextResponse.json({ error: '无权限', code: 'FORBIDDEN' }, { status: 403 })
    }

    // 检查通知是否存在
    const existing = await prisma.notification.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '通知不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (validationResult.data.title !== undefined) updateData.title = validationResult.data.title
    if (validationResult.data.content !== undefined)
      updateData.content = validationResult.data.content
    if (validationResult.data.type !== undefined) updateData.type = validationResult.data.type
    if (validationResult.data.priority !== undefined)
      updateData.priority = validationResult.data.priority
    if (validationResult.data.status !== undefined) updateData.status = validationResult.data.status
    if (validationResult.data.isPopup !== undefined)
      updateData.isPopup = validationResult.data.isPopup
    if (validationResult.data.isPinned !== undefined)
      updateData.isPinned = validationResult.data.isPinned
    if (validationResult.data.popupStartAt !== undefined) {
      updateData.popupStartAt = validationResult.data.popupStartAt
        ? new Date(validationResult.data.popupStartAt)
        : null
    }
    if (validationResult.data.popupEndAt !== undefined) {
      updateData.popupEndAt = validationResult.data.popupEndAt
        ? new Date(validationResult.data.popupEndAt)
        : null
    }
    if (validationResult.data.validFrom !== undefined) {
      updateData.validFrom = validationResult.data.validFrom
        ? new Date(validationResult.data.validFrom)
        : null
    }
    if (validationResult.data.validUntil !== undefined) {
      updateData.validUntil = validationResult.data.validUntil
        ? new Date(validationResult.data.validUntil)
        : null
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            realName: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    console.error('Update notification error:', error)
    return NextResponse.json({ error: '更新通知失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// DELETE - 删除通知
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const authorId = request.headers.get('x-user-id')
    if (!authorId) {
      return NextResponse.json({ error: '未登录', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 检查是否为管理员
    const user = await prisma.sysUser.findUnique({
      where: { id: authorId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const isAdmin = user.roles.some((r) => r.role.code === 'ADMIN')
    if (!isAdmin) {
      return NextResponse.json({ error: '无权限', code: 'FORBIDDEN' }, { status: 403 })
    }

    // 检查通知是否存在
    const existing = await prisma.notification.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '通知不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    await prisma.notification.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '通知已删除',
    })
  } catch (error) {
    console.error('Delete notification error:', error)
    return NextResponse.json({ error: '删除通知失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
