/**
 * 弹窗通知 API
 * GET /api/notifications/popup - 获取当前需要弹窗的通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const now = new Date()

    // 获取当前需要弹窗的通知
    const notifications = await prisma.notification.findMany({
      where: {
        status: 'PUBLISHED',
        isPopup: true,
        OR: [{ popupStartAt: null }, { popupStartAt: { lte: now } }],
        AND: [
          {
            OR: [{ popupEndAt: null }, { popupEndAt: { gte: now } }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        priority: true,
        publishedAt: true,
      },
      orderBy: [{ isPinned: 'desc' }, { priority: 'desc' }, { publishedAt: 'desc' }],
    })

    // 如果提供了 userId，过滤掉已读的通知
    let unreadNotifications = notifications
    if (userId) {
      const readRecords = await prisma.notificationRead.findMany({
        where: {
          userId,
          notificationId: { in: notifications.map((n) => n.id) },
        },
        select: { notificationId: true },
      })

      const readIds = new Set(readRecords.map((r) => r.notificationId))
      unreadNotifications = notifications.filter((n) => !readIds.has(n.id))
    }

    return NextResponse.json({
      success: true,
      data: unreadNotifications,
    })
  } catch (error) {
    console.error('Get popup notifications error:', error)
    return NextResponse.json({ error: '获取弹窗通知失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
