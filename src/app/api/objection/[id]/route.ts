/**
 * 异议详情 API
 * GET    /api/objection/[id] - 获取异议详情
 * PATCH  /api/objection/[id] - 处理异议（解决/驳回）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getCurrentUserId } from '@/lib/auth/middleware'

const resolveObjectionSchema = z.object({
  status: z.enum(['RESOLVED', 'REJECTED']),
  resolveRemark: z.string().min(1, '处理备注不能为空').max(500, '处理备注不能超过 500 字'),
})

// GET - 获取异议详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const objection = await prisma.objection.findUnique({
      where: { id },
      include: {
        receiveRecord: {
          include: {
            bdc: {
              include: {
                village: {
                  include: {
                    town: true,
                  },
                },
              },
            },
            processNodes: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })

    if (!objection) {
      return NextResponse.json({ error: '异议记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: objection })
  } catch (error) {
    console.error('Get objection error:', error)
    return NextResponse.json({ error: '获取异议详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PATCH - 处理异议
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = resolveObjectionSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { status, resolveRemark } = validationResult.data
    const resolverId = await getCurrentUserId(request)

    if (!resolverId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 查找异议记录
    const objection = await prisma.objection.findUnique({
      where: { id },
      include: { receiveRecord: true },
    })

    if (!objection) {
      return NextResponse.json({ error: '异议记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (objection.status !== 'PENDING') {
      return NextResponse.json(
        { error: '该异议已被处理', code: 'ALREADY_RESOLVED' },
        { status: 400 },
      )
    }

    // 使用事务处理异议
    await prisma.$transaction(async (tx) => {
      // 更新异议记录
      await tx.objection.update({
        where: { id },
        data: {
          status,
          resolveRemark,
          resolverId,
          resolverName: '系统',
          resolvedAt: new Date(),
        },
      })

      // 如果解决/驳回，恢复领证记录状态为 ISSUED
      if (status === 'RESOLVED' || status === 'REJECTED') {
        await tx.zjdReceiveRecord.update({
          where: { id: objection.receiveRecordId },
          data: { status: 'ISSUED' },
        })

        // 创建流程节点
        await tx.processNode.create({
          data: {
            receiveRecordId: objection.receiveRecordId,
            nodeType: 'RESOLVE',
            nodeName: status === 'RESOLVED' ? '异议已解决' : '异议已驳回',
            operatorId: resolverId,
            operatorName: '系统',
            description: `处理备注：${resolveRemark}`,
          },
        })
      }
    })

    // 返回更新后的异议记录
    const updatedObjection = await prisma.objection.findUnique({
      where: { id },
      include: {
        receiveRecord: {
          include: {
            bdc: true,
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: updatedObjection })
  } catch (error) {
    console.error('Resolve objection error:', error)
    return NextResponse.json({ error: '处理异议失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
