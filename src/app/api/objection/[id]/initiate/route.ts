/**
 * 异议流程初始化 API
 * POST /api/objection/[id]/initiate - 为异议初始化审批流程
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'
import { getCurrentUserId } from '@/lib/auth/middleware'
import { z } from 'zod'

const initiateSchema = z.object({
  workflowId: z.string().min(1, '流程 ID 不能为空'),
  approverId: z.string().optional(),
  approverName: z.string().optional(),
})

// POST - 初始化异议流程
async function initiateWorkflowHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = initiateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { workflowId, approverId, approverName } = validationResult.data
    const operatorId = await getCurrentUserId(request)

    if (!operatorId) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 使用传入的处理人，默认当前操作人
    const targetApproverId = approverId || operatorId
    const targetApproverName = approverName || '系统'

    // 检查异议是否存在
    const objection = await prisma.objection.findUnique({
      where: { id },
      include: { receiveRecord: true },
    })

    if (!objection) {
      return NextResponse.json({ error: '异议记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 检查异议是否已初始化流程
    if (objection.currentWorkflowId) {
      return NextResponse.json(
        { error: '该异议已初始化流程，不能重复初始化', code: 'ALREADY_INITIATED' },
        { status: 400 },
      )
    }

    // 检查异议状态
    if (objection.status !== 'PENDING') {
      return NextResponse.json(
        { error: '只有待处理的异议可以初始化流程', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 检查流程是否存在
    const workflow = await prisma.objectionWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    if (!workflow) {
      return NextResponse.json({ error: '流程不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { error: '流程已被禁用', code: 'WORKFLOW_DISABLED' },
        { status: 400 },
      )
    }

    if (workflow.steps.length === 0) {
      return NextResponse.json({ error: '流程未配置步骤', code: 'NO_STEPS' }, { status: 400 })
    }

    // 使用事务初始化流程
    const firstStep = workflow.steps[0]
    const result = await prisma.$transaction(async (tx) => {
      // 更新异议记录，关联流程和当前步骤
      await tx.objection.update({
        where: { id },
        data: {
          currentWorkflowId: workflowId,
          currentStepOrder: 1,
        },
      })

      // 创建第一个任务
      const task = await tx.objectionTask.create({
        data: {
          objectionId: id,
          stepId: firstStep.id,
          stepOrder: firstStep.stepOrder,
          stepName: firstStep.stepName,
          stepType: firstStep.stepType,
          status: 'PENDING',
          approverId: targetApproverId,
          approverName: targetApproverName,
          assignedAt: new Date(),
        },
      })

      // 记录流程节点
      await tx.processNode.create({
        data: {
          receiveRecordId: objection.receiveRecordId,
          nodeType: 'OBJECTION',
          nodeName: '异议流程开始',
          operatorId,
          operatorName: '系统',
          description: `异议流程【${workflow.name}】已启动，第一步：${firstStep.stepName}`,
        },
      })

      return task
    })

    return NextResponse.json({
      success: true,
      data: {
        taskId: result.id,
        stepOrder: result.stepOrder,
        stepName: result.stepName,
        status: result.status,
      },
    })
  } catch (error) {
    console.error('Initiate workflow error:', error)
    return NextResponse.json({ error: '初始化流程失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(['objection:write'])(initiateWorkflowHandler)
