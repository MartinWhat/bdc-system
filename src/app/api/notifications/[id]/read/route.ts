/**
 * 标记已读 API
 * POST /api/notifications/[id]/read - 标记通知为已读
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const readSchema = z.object({
  userId: z.string().min(1, '用户ID不能为空'),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = readSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { userId } = validationResult.data

    // 检查通知是否存在
    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) {
      return NextResponse.json({ error: '通知不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 检查是否已读
    const existingRead = await prisma.notificationRead.findUnique({
      where: {
        notificationId_userId: {
          notificationId: id,
          userId,
        },
      },
    })

    if (existingRead) {
      return NextResponse.json({
        success: true,
        message: '已标记为已读',
        readCount: notification.readCount,
      })
    }

    // 创建已读记录并更新阅读数
    await prisma.$transaction([
      prisma.notificationRead.create({
        data: {
          notificationId: id,
          userId,
        },
      }),
      prisma.notification.update({
        where: { id },
        data: {
          readCount: { increment: 1 },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      readCount: notification.readCount + 1,
    })
  } catch (error) {
    console.error('Mark read error:', error)
    return NextResponse.json({ error: '标记已读失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
