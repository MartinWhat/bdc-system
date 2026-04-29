/**
 * 证书出库 API
 * POST /api/collective/[id]/out - 申请出库
 * PATCH /api/collective/[id]/out - 审批出库
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const outApplySchema = z.object({
  outReason: z.string().min(1, '出库原因不能为空'),
  expectedReturnDate: z.string().optional(),
})

const outApproveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  remark: z.string().optional(),
})

// POST - 申请出库
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = outApplySchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { outReason, expectedReturnDate } = validationResult.data
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

    // 只有在库状态的证书可以申请出库
    if (cert.status !== 'IN_STOCK') {
      return NextResponse.json(
        { error: '只有在库状态的证书可以申请出库', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 检查是否已冻结
    if (cert.isFrozen) {
      return NextResponse.json(
        { error: '证书已被冻结，无法出库', code: 'CERT_FROZEN' },
        { status: 400 },
      )
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          outBy: operatorId,
          outAt: new Date(),
          outReason,
          expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : undefined,
          // 出库申请后状态变为 OUT_STOCK
          status: 'OUT_STOCK',
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
          operationType: 'OUT_APPLY',
          operatorId,
          operatorName: '系统',
          description: `申请出库: ${outReason}`,
          metadata: JSON.stringify({
            outReason,
            expectedReturnDate,
          }),
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: '出库申请已提交',
    })
  } catch (error) {
    console.error('Out collective cert error:', error)
    return NextResponse.json({ error: '出库申请失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PATCH - 审批出库（可选流程，简化版直接申请即出库）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = outApproveSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { action, remark } = validationResult.data
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

    // 检查证书状态（此 API 用于需要审批的场景）
    if (cert.status !== 'IN_STOCK') {
      return NextResponse.json(
        { error: '证书状态不允许审批', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const operationType = action === 'approve' ? 'OUT_APPROVE' : 'OUT_REJECT'
      const newStatus = action === 'approve' ? 'OUT_STOCK' : 'IN_STOCK'

      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          status: newStatus,
          outApproveBy: operatorId,
          outApproveAt: new Date(),
          outApproveRemark: remark,
          // 审批通过时确认出库
          outAt: action === 'approve' ? new Date() : undefined,
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
          operationType,
          operatorId,
          operatorName: '系统',
          description: action === 'approve' ? '出库审批通过' : `出库审批驳回: ${remark || ''}`,
          metadata: JSON.stringify({ remark }),
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: action === 'approve' ? '出库审批通过' : '出库审批驳回',
    })
  } catch (error) {
    console.error('Approve out collective cert error:', error)
    return NextResponse.json({ error: '出库审批失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
