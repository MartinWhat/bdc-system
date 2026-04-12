/**
 * 镇街详情/更新/删除 API
 * GET    /api/towns/[id] - 获取镇街详情
 * PUT    /api/towns/[id] - 更新镇街
 * DELETE /api/towns/[id] - 删除镇街
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateTownSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  sortOrder: z.number().optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const town = await prisma.sysTown.findUnique({
      where: { id },
      include: {
        villages: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { villages: true },
        },
      },
    })

    if (!town) {
      return NextResponse.json({ error: '镇街不存在', code: 'TOWN_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: town,
    })
  } catch (error) {
    console.error('Get town error:', error)
    return NextResponse.json({ error: '获取镇街详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = updateTownSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const existingTown = await prisma.sysTown.findUnique({
      where: { id },
    })

    if (!existingTown) {
      return NextResponse.json({ error: '镇街不存在', code: 'TOWN_NOT_FOUND' }, { status: 404 })
    }

    const town = await prisma.sysTown.update({
      where: { id },
      data: validationResult.data,
    })

    return NextResponse.json({
      success: true,
      data: town,
    })
  } catch (error) {
    console.error('Update town error:', error)
    return NextResponse.json({ error: '更新镇街失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existingTown = await prisma.sysTown.findUnique({
      where: { id },
      include: {
        _count: {
          select: { villages: true },
        },
      },
    })

    if (!existingTown) {
      return NextResponse.json({ error: '镇街不存在', code: 'TOWN_NOT_FOUND' }, { status: 404 })
    }

    if (existingTown._count.villages > 0) {
      return NextResponse.json(
        { error: '该镇街下还有村居，无法删除', code: 'TOWN_HAS_VILLAGES' },
        { status: 409 },
      )
    }

    await prisma.sysTown.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '镇街已删除',
    })
  } catch (error) {
    console.error('Delete town error:', error)
    return NextResponse.json({ error: '删除镇街失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
