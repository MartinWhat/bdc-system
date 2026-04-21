/**
 * 通知公告 API
 * GET    /api/notifications - 获取通知列表
 * POST   /api/notifications - 创建通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createNotificationSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  type: z.enum(['SYSTEM', 'POLICY', 'ANNOUNCEMENT']).default('SYSTEM'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  isPopup: z.boolean().default(false),
  popupStartAt: z.string().datetime().optional(),
  popupEndAt: z.string().datetime().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isPinned: z.boolean().default(false),
  pdfUrl: z.string().url().optional().or(z.literal('')),
})

// GET - 获取通知列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const keyword = searchParams.get('keyword') || ''

    const where: Record<string, unknown> = {}

    if (type) {
      where.type = type
    }

    if (type) {
      where.type = type
    }

    // status 为空字符串时显示所有状态，为 null 时默认只显示已发布
    if (status === '') {
      // 不限制状态，显示所有
    } else if (status) {
      where.status = status
    } else {
      // 默认只显示已发布的通知
      where.status = 'PUBLISHED'
    }

    if (keyword) {
      where.OR = [{ title: { contains: keyword } }, { content: { contains: keyword } }]
    }

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          priority: true,
          status: true,
          isPopup: true,
          popupStartAt: true,
          popupEndAt: true,
          validFrom: true,
          validUntil: true,
          isPinned: true,
          pdfUrl: true,
          readCount: true,
          publishedAt: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              realName: true,
            },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        list: notifications,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ error: '获取通知列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建通知
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createNotificationSchema.safeParse(body)

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

    const {
      title,
      content,
      type,
      priority,
      isPopup,
      popupStartAt,
      popupEndAt,
      validFrom,
      validUntil,
      isPinned,
      pdfUrl,
    } = validationResult.data

    const notification = await prisma.notification.create({
      data: {
        title,
        content,
        type,
        priority,
        isPopup,
        popupStartAt: popupStartAt ? new Date(popupStartAt) : null,
        popupEndAt: popupEndAt ? new Date(popupEndAt) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        isPinned,
        pdfUrl: pdfUrl || null,
        status: 'DRAFT',
        authorId,
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
    console.error('Create notification error:', error)
    return NextResponse.json({ error: '创建通知失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
