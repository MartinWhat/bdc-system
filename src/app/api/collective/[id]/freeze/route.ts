/**
 * 证书冻结/解冻 API
 * POST /api/collective/[id]/freeze - 冻结证书
 * DELETE /api/collective/[id]/freeze - 解冻证书
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const freezeSchema = z.object({
  freezeReason: z.string().min(1, '冻结原因不能为空'),
})

// POST - 冻结证书
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = freezeSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { freezeReason } = validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查证书是否存在
    const cert = await prisma.collectiveCert.findUnique({
      where: { id },
    })

    if (!cert) {
      return NextResponse.json({ error: '证书不存在', code: 'CERT_NOT_FOUND' }, { status: 404 })
    }

    // 只有在库或已归还状态的证书可以冻结
    if (!['IN_STOCK', 'RETURNED'].includes(cert.status)) {
      return NextResponse.json(
        { error: '当前状态不允许冻结', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 检查是否已冻结
    if (cert.isFrozen) {
      return NextResponse.json(
        { error: '证书已被冻结', code: 'CERT_ALREADY_FROZEN' },
        { status: 400 },
      )
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          isFrozen: true,
          freezeReason,
          freezeBy: operatorId,
          freezeAt: new Date(),
          status: 'FROZEN',
        },
        include: {
          village: {
            include: {
              town: true,
            },
          },
        },
      })

      await tx.certOperation.create({
        data: {
          certId: id,
          operationType: 'FREEZE',
          operatorId,
          operatorName: '系统',
          description: `冻结证书: ${freezeReason}`,
          metadata: JSON.stringify({ freezeReason }),
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: '证书冻结成功',
    })
  } catch (error) {
    console.error('Freeze collective cert error:', error)
    return NextResponse.json({ error: '证书冻结失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// DELETE - 解冻证书
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查证书是否存在
    const cert = await prisma.collectiveCert.findUnique({
      where: { id },
    })

    if (!cert) {
      return NextResponse.json({ error: '证书不存在', code: 'CERT_NOT_FOUND' }, { status: 404 })
    }

    // 只有冻结状态的证书可以解冻
    if (!cert.isFrozen) {
      return NextResponse.json({ error: '证书未被冻结', code: 'CERT_NOT_FROZEN' }, { status: 400 })
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          isFrozen: false,
          freezeReason: null,
          freezeBy: null,
          freezeAt: null,
          status: 'IN_STOCK',
        },
        include: {
          village: {
            include: {
              town: true,
            },
          },
        },
      })

      await tx.certOperation.create({
        data: {
          certId: id,
          operationType: 'UNFREEZE',
          operatorId,
          operatorName: '系统',
          description: '解冻证书',
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: '证书解冻成功',
    })
  } catch (error) {
    console.error('Unfreeze collective cert error:', error)
    return NextResponse.json({ error: '证书解冻失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
