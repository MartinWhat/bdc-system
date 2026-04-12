/**
 * 镇街管理 API
 * GET    /api/towns - 获取镇街列表
 * POST   /api/towns - 创建镇街
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createTownSchema = z.object({
  code: z.string().min(1, '镇街代码不能为空'),
  name: z.string().min(1, '镇街名称不能为空'),
  sortOrder: z.number().optional().default(0),
})

// GET - 获取镇街列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyword = searchParams.get('keyword') || ''
    const status = searchParams.get('status')

    const where: any = {}

    if (keyword) {
      where.OR = [{ name: { contains: keyword } }, { code: { contains: keyword } }]
    }

    if (status) {
      where.status = status
    }

    const towns = await prisma.sysTown.findMany({
      where,
      include: {
        _count: {
          select: { villages: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      success: true,
      data: towns,
    })
  } catch (error) {
    console.error('Get towns error:', error)
    return NextResponse.json({ error: '获取镇街列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建镇街
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createTownSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { code, name, sortOrder } = validationResult.data

    // 检查代码是否已存在
    const existingTown = await prisma.sysTown.findUnique({
      where: { code },
    })

    if (existingTown) {
      return NextResponse.json(
        { error: '镇街代码已存在', code: 'TOWN_CODE_EXISTS' },
        { status: 409 },
      )
    }

    const town = await prisma.sysTown.create({
      data: {
        code,
        name,
        sortOrder,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({
      success: true,
      data: town,
    })
  } catch (error: any) {
    console.error('Create town error:', error)
    return NextResponse.json({ error: '创建镇街失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
