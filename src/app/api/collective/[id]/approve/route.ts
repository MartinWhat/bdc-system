/**
 * 证书入库审核 API
 * POST /api/collective/[id]/approve - 审核入库申请（通过/驳回）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/middleware'
import { z } from 'zod'

const approveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  remark: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = approveSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { action, remark } = validationResult.data
    const operatorId = await getCurrentUserId(request)

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

    // 只有待审核状态的证书可以审核
    if (cert.status !== 'PENDING_APPROVE') {
      return NextResponse.json(
        { error: '证书不在待审核状态', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const operationType = action === 'approve' ? 'STOCK_APPROVE' : 'STOCK_REJECT'
      const newStatus = action === 'approve' ? 'IN_STOCK' : 'CANCELLED'

      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          status: newStatus,
          approveBy: operatorId,
          approveAt: new Date(),
          approveRemark: remark,
          // 审核通过时更新入库时间
          stockAt: action === 'approve' ? new Date() : undefined,
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
          description: action === 'approve' ? '入库审核通过' : `入库审核驳回: ${remark || ''}`,
          metadata: JSON.stringify({ remark }),
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: action === 'approve' ? '入库审核通过' : '入库审核驳回',
    })
  } catch (error) {
    console.error('Approve collective cert error:', error)
    return NextResponse.json({ error: '审核操作失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
