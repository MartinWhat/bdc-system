/**
 * 证书归还 API
 * POST /api/collective/[id]/return - 归还证书
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const returnSchema = z.object({
  returnRemark: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = returnSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { returnRemark } = validationResult.data
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

    // 只有已出库状态的证书可以归还
    if (cert.status !== 'OUT_STOCK') {
      return NextResponse.json(
        { error: '只有已出库状态的证书可以归还', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          status: 'IN_STOCK',
          returnBy: operatorId,
          returnAt: new Date(),
          returnRemark,
          actualReturnDate: new Date(),
          // 清空出库信息
          outReason: null,
          expectedReturnDate: null,
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
          operationType: 'RETURN',
          operatorId,
          operatorName: '系统',
          description: `证书归还: ${returnRemark || ''}`,
          metadata: JSON.stringify({ returnRemark }),
        },
      })

      return updatedCert
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: '证书归还成功',
    })
  } catch (error) {
    console.error('Return collective cert error:', error)
    return NextResponse.json({ error: '证书归还失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
