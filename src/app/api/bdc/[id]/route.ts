/**
 * 宅基地详情/更新/删除 API
 * GET    /api/bdc/[id] - 获取宅基地详情
 * PUT    /api/bdc/[id] - 更新宅基地档案
 * DELETE /api/bdc/[id] - 删除宅基地档案
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { z } from 'zod'

const updateBdcSchema = z.object({
  villageId: z.string().optional(),
  certNo: z.string().optional(),
  ownerName: z.string().optional(),
  idCard: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  area: z.number().positive().optional(),
  landUseType: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'CERTIFIED', 'CANCELLED']).optional(),
  approvedArea: z.number().optional(),
  approvedDate: z.string().optional(),
  remark: z.string().optional(),
})

// GET - 获取宅基地详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const bdc = await prisma.zjdBdc.findUnique({
      where: { id },
      include: {
        village: {
          include: {
            town: true,
          },
        },
        receiveRecords: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!bdc) {
      return NextResponse.json(
        { error: '宅基地档案不存在', code: 'BDC_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 脱敏处理
    const sanitizedBdc = {
      ...bdc,
      idCard: bdc.idCard ? maskIdCard(bdc.idCard) : undefined,
      phone: bdc.phone ? maskPhone(bdc.phone) : undefined,
    }

    return NextResponse.json({
      success: true,
      data: sanitizedBdc,
    })
  } catch (error) {
    console.error('Get BDC error:', error)
    return NextResponse.json({ error: '获取宅基地档案失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT - 更新宅基地档案
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = updateBdcSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const existingBdc = await prisma.zjdBdc.findUnique({
      where: { id },
    })

    if (!existingBdc) {
      return NextResponse.json(
        { error: '宅基地档案不存在', code: 'BDC_NOT_FOUND' },
        { status: 404 },
      )
    }

    const updateData: Record<string, unknown> = {}

    if (body.villageId !== undefined) updateData.villageId = body.villageId
    if (body.certNo !== undefined) updateData.certNo = body.certNo
    if (body.ownerName !== undefined) updateData.ownerName = body.ownerName
    if (body.address !== undefined) updateData.address = body.address
    if (body.area !== undefined) updateData.area = body.area
    if (body.landUseType !== undefined) updateData.landUseType = body.landUseType
    if (body.status !== undefined) updateData.status = body.status
    if (body.approvedArea !== undefined) updateData.approvedArea = body.approvedArea
    if (body.approvedDate !== undefined) updateData.approvedDate = new Date(body.approvedDate)
    if (body.remark !== undefined) updateData.remark = body.remark

    // 更新加密字段
    if (body.idCard !== undefined) {
      const result = await encryptSensitiveField(body.idCard)
      updateData.idCard = result.encrypted
      updateData.idCardHash = result.hash
    }

    if (body.phone !== undefined) {
      const result = await encryptSensitiveField(body.phone)
      updateData.phone = result.encrypted
      updateData.phoneHash = result.hash
    }

    const bdc = await prisma.zjdBdc.update({
      where: { id },
      data: updateData,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: bdc,
    })
  } catch (error) {
    console.error('Update BDC error:', error)
    return NextResponse.json({ error: '更新宅基地档案失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// DELETE - 删除宅基地档案
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existingBdc = await prisma.zjdBdc.findUnique({
      where: { id },
    })

    if (!existingBdc) {
      return NextResponse.json(
        { error: '宅基地档案不存在', code: 'BDC_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 软删除：更新状态为已注销
    await prisma.zjdBdc.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return NextResponse.json({
      success: true,
      message: '宅基地档案已删除',
    })
  } catch (error) {
    console.error('Delete BDC error:', error)
    return NextResponse.json({ error: '删除宅基地档案失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// 脱敏函数
function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 7) return idCard
  return idCard.slice(0, 3) + '*'.repeat(idCard.length - 7) + idCard.slice(-4)
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}
