/**
 * 村居管理 API
 * GET    /api/villages - 获取村居列表
 * POST   /api/villages - 创建村居（需要镇街级管理员权限）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { hasAnyRole, getUserFromRequest } from '@/lib/middleware/auth'
import { getDataPermissionFilter } from '@/lib/auth'
import { logOperation } from '@/lib/log'

const createVillageSchema = z.object({
  townId: z.string().min(1, '所属镇街不能为空'),
  code: z.string().min(1, '村居代码不能为空'),
  name: z.string().min(1, '村居名称不能为空'),
  sortOrder: z.number().optional().default(0),
})

// GET - 获取村居列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyword = searchParams.get('keyword') || ''
    const townId = searchParams.get('townId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}

    if (keyword) {
      where.OR = [{ name: { contains: keyword } }, { code: { contains: keyword } }]
    }

    if (townId) {
      where.townId = townId
    }

    if (status) {
      where.status = status
    }

    const villages = await prisma.sysVillage.findMany({
      where,
      include: {
        town: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: { bdcs: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      success: true,
      data: villages,
    })
  } catch (error) {
    console.error('Get villages error:', error)
    return NextResponse.json({ error: '获取村居列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建村居（需要镇街级管理员权限）
export async function POST(request: NextRequest) {
  try {
    // 授权校验：需要管理员或镇街级管理员权限
    if (!hasAnyRole(request, ['ADMIN', 'TOWN_ADMIN', 'TOWN_MANAGER'])) {
      return NextResponse.json(
        { error: '需要管理员或镇街级权限', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const validationResult = createVillageSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { townId, code, name, sortOrder } = validationResult.data

    // 检查代码是否已存在
    const existingVillage = await prisma.sysVillage.findUnique({
      where: { code },
    })

    if (existingVillage) {
      return NextResponse.json(
        { error: '村居代码已存在', code: 'VILLAGE_CODE_EXISTS' },
        { status: 409 },
      )
    }

    // 检查镇街是否存在
    const town = await prisma.sysTown.findUnique({
      where: { id: townId },
    })

    if (!town) {
      return NextResponse.json({ error: '所属镇街不存在', code: 'TOWN_NOT_FOUND' }, { status: 404 })
    }

    const village = await prisma.sysVillage.create({
      data: {
        townId,
        code,
        name,
        sortOrder,
        status: 'ACTIVE',
      },
      include: {
        town: true,
      },
    })

    // 记录操作日志
    const { userId } = getUserFromRequest(request)
    await logOperation({
      userId: userId || 'unknown',
      action: 'CREATE',
      module: 'VILLAGE',
      description: `创建村居：${village.name} (${village.code})`,
      status: 'SUCCESS',
    })

    return NextResponse.json({
      success: true,
      data: village,
    })
  } catch (error: unknown) {
    console.error('Create village error:', error)
    return NextResponse.json({ error: '创建村居失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
