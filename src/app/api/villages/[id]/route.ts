/**
 * 村居详情/更新/删除 API
 * GET    /api/villages/[id] - 获取村居详情
 * PUT    /api/villages/[id] - 更新村居
 * DELETE /api/villages/[id] - 删除村居
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateVillageSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  townId: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  sortOrder: z.number().optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const village = await prisma.sysVillage.findUnique({
      where: { id },
      include: {
        town: true,
        _count: {
          select: { bdcs: true },
        },
      },
    })

    if (!village) {
      return NextResponse.json({ error: '村居不存在', code: 'VILLAGE_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: village,
    })
  } catch (error) {
    console.error('Get village error:', error)
    return NextResponse.json({ error: '获取村居详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = updateVillageSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const existingVillage = await prisma.sysVillage.findUnique({
      where: { id },
    })

    if (!existingVillage) {
      return NextResponse.json({ error: '村居不存在', code: 'VILLAGE_NOT_FOUND' }, { status: 404 })
    }

    const village = await prisma.sysVillage.update({
      where: { id },
      data: validationResult.data,
      include: {
        town: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: village,
    })
  } catch (error) {
    console.error('Update village error:', error)
    return NextResponse.json({ error: '更新村居失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existingVillage = await prisma.sysVillage.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bdcs: true },
        },
      },
    })

    if (!existingVillage) {
      return NextResponse.json({ error: '村居不存在', code: 'VILLAGE_NOT_FOUND' }, { status: 404 })
    }

    if (existingVillage._count.bdcs > 0) {
      return NextResponse.json(
        { error: '该村居下还有宅基地档案，无法删除', code: 'VILLAGE_HAS_BDC' },
        { status: 409 },
      )
    }

    await prisma.sysVillage.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '村居已删除',
    })
  } catch (error) {
    console.error('Delete village error:', error)
    return NextResponse.json({ error: '删除村居失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
