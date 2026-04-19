/**
 * 发布通知 API
 * PUT /api/notifications/[id]/publish - 发布通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (existing.status === 'PUBLISHED') {
      return NextResponse.json({ error: '通知已发布', code: 'ALREADY_PUBLISHED' }, { status: 400 })
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
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
    console.error('Publish notification error:', error)
    return NextResponse.json({ error: '发布通知失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
