/**
 * 异议登记 API
 * GET    /api/objection - 获取异议列表
 * POST   /api/objection - 创建异议记录
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withPermission } from '@/lib/api/withPermission'

const PHONE_REGEX = /^1[3-9]\d{9}$/

const createObjectionSchema = z.object({
  receiveRecordId: z.string().min(1, '领证记录 ID 不能为空'),
  objectionType: z.enum(['NAME_ERROR', 'ID_CARD_ERROR', 'AREA_ERROR', 'OTHER']),
  description: z.string().min(1, '异议描述不能为空').max(500, '异议描述不能超过 500 字'),
  contactName: z.string().min(1, '联系人不能为空'),
  contactPhone: z.string().regex(PHONE_REGEX, '手机号格式不正确'),
})

// GET - 获取异议列表
async function getObjectionsListHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '10'), 100)
    const status = searchParams.get('status')
    const receiveRecordId = searchParams.get('receiveRecordId')

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (receiveRecordId) {
      where.receiveRecordId = receiveRecordId
    }

    const [total, objections] = await Promise.all([
      prisma.objection.count({ where }),
      prisma.objection.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          receiveRecord: {
            include: {
              bdc: {
                include: {
                  village: {
                    include: {
                      town: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: { list: objections, total, page, pageSize },
    })
  } catch (error) {
    console.error('Get objections error:', error)
    return NextResponse.json({ error: '获取异议列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(
  ['objection:read'],
  ['ADMIN', 'OBJECTION_HANDLER'],
)(getObjectionsListHandler)

// POST - 创建异议记录
async function createObjectionHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createObjectionSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { receiveRecordId, objectionType, description, contactName, contactPhone } =
      validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查领证记录是否存在
    const record = await prisma.zjdReceiveRecord.findUnique({
      where: { id: receiveRecordId },
    })

    if (!record) {
      return NextResponse.json(
        { error: '领证记录不存在', code: 'RECORD_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 检查领证记录状态是否允许创建异议
    if (record.status !== 'ISSUED') {
      return NextResponse.json(
        { error: '当前状态不允许创建异议', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 获取激活的默认流程
    const workflow = await prisma.objectionWorkflow.findFirst({
      where: { isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    if (!workflow || workflow.steps.length === 0) {
      return NextResponse.json(
        { error: '未配置异议处理流程，请联系管理员', code: 'WORKFLOW_NOT_FOUND' },
        { status: 400 },
      )
    }

    // 使用事务创建异议记录、流程节点和第一个任务
    const result = await prisma.$transaction(async (tx) => {
      // 创建异议记录（状态为 PROCESSING）
      const objection = await tx.objection.create({
        data: {
          receiveRecordId,
          objectionType,
          description,
          contactName,
          contactPhone,
          status: 'PROCESSING',
          currentWorkflowId: workflow.id,
          currentStepOrder: 1,
        },
        include: {
          receiveRecord: {
            include: {
              bdc: true,
            },
          },
        },
      })

      // 创建第一个任务（处理人为当前操作人）
      const firstStep = workflow.steps[0]
      await tx.objectionTask.create({
        data: {
          objectionId: objection.id,
          stepId: firstStep.id,
          stepOrder: firstStep.stepOrder,
          stepName: firstStep.stepName,
          stepType: firstStep.stepType,
          status: 'PENDING',
          approverId: operatorId,
          approverName: '系统',
          assignedAt: new Date(),
        },
      })

      // 更新领证记录状态为异议中
      await tx.zjdReceiveRecord.update({
        where: { id: receiveRecordId },
        data: { status: 'OBJECTION' },
      })

      // 创建流程节点
      await tx.processNode.create({
        data: {
          receiveRecordId,
          nodeType: 'OBJECTION',
          nodeName: '登记异议',
          operatorId,
          operatorName: '系统',
          description: `异议类型：${objectionType}, 描述：${description}`,
        },
      })

      return objection
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Create objection error:', error)
    return NextResponse.json({ error: '创建异议记录失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(
  ['objection:create'],
  ['ADMIN', 'OBJECTION_HANDLER'],
)(createObjectionHandler)
