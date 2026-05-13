/**
 * 通知浏览量 API
 * POST /api/notifications/[id]/view - 记录一次通知浏览
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        readCount: true,
      },
    })

    if (!notification) {
      return NextResponse.json({ error: '通知不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        readCount: {
          increment: 1,
        },
      },
      select: {
        readCount: true,
      },
    })

    return NextResponse.json({
      success: true,
      readCount: updated.readCount,
    })
  } catch (error) {
    console.error('Record notification view error:', error)
    return NextResponse.json({ error: '记录浏览量失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
