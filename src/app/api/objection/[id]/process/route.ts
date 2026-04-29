/**
 * 异议流程执行 API
 * GET    /api/objection/[id]/process - 获取异议处理进度
 * POST   /api/objection/[id]/process - 执行异议处理（审批）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'
import { getCurrentUserId } from '@/lib/auth/middleware'
import { z } from 'zod'

const processSchema = z.object({
  action: z.enum(['approve', 'reject']),
  remark: z.string().max(500, '备注不能超过 500 字').optional(),
  nextApproverId: z.string().optional(),
  nextApproverName: z.string().optional(),
})

// GET - 获取异议处理进度
async function getProcessHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
          },
        },
        tasks: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    })

    if (!objection) {
      return NextResponse.json({ error: '异议记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 获取流程配置
    let workflow = null
    if (objection.currentWorkflowId) {
      workflow = await prisma.objectionWorkflow.findUnique({
        where: { id: objection.currentWorkflowId },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      })
    }

    // 获取当前待处理的任务
    const currentTask = objection.tasks.find((t) => t.status === 'PENDING')

    // 获取流程节点（通过领证记录）
    const processNodes = await prisma.processNode.findMany({
      where: { receiveRecordId: objection.receiveRecordId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        objectionId: id,
        objectionStatus: objection.status,
        workflow: workflow
          ? {
              id: workflow.id,
              name: workflow.name,
              currentStepOrder: objection.currentStepOrder,
              totalSteps: workflow.steps.length,
            }
          : null,
        currentTask: currentTask
          ? {
              id: currentTask.id,
              stepOrder: currentTask.stepOrder,
              stepName: currentTask.stepName,
              stepType: currentTask.stepType,
              status: currentTask.status,
              approverName: currentTask.approverName,
              assignedAt: currentTask.assignedAt,
            }
          : null,
        tasks: objection.tasks.map((task) => ({
          id: task.id,
          stepOrder: task.stepOrder,
          stepName: task.stepName,
          stepType: task.stepType,
          status: task.status,
          approverName: task.approverName,
          approvedAt: task.approvedAt,
          approveRemark: task.approveRemark,
        })),
        processNodes: processNodes.map((node) => ({
          id: node.id,
          nodeType: node.nodeType,
          nodeName: node.nodeName,
          operatorName: node.operatorName,
          description: node.description,
          createdAt: node.createdAt,
        })),
        receiveRecord: {
          id: objection.receiveRecord.id,
          status: objection.receiveRecord.status,
          bdc: {
            id: objection.receiveRecord.bdc.id,
            certNo: objection.receiveRecord.bdc.certNo,
            ownerName: objection.receiveRecord.bdc.ownerName,
            village: objection.receiveRecord.bdc.village?.name,
            town: objection.receiveRecord.bdc.village?.town?.name,
          },
        },
      },
    })
  } catch (error) {
    console.error('Get process error:', error)
    return NextResponse.json({ error: '获取处理进度失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(['objection:read'])(getProcessHandler)

// POST - 执行异议处理
async function executeProcessHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = processSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { action, remark, nextApproverId, nextApproverName } = validationResult.data
    const operatorId = await getCurrentUserId(request)

    if (!operatorId) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 使用传入的处理人，默认当前操作人
    const targetApproverId = nextApproverId || operatorId
    const targetApproverName = nextApproverName || '系统'

    // 获取异议及其当前任务
    const objection = await prisma.objection.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { stepOrder: 'asc' },
        },
        receiveRecord: true,
      },
    })

    if (!objection) {
      return NextResponse.json({ error: '异议记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (!objection.currentWorkflowId) {
      return NextResponse.json(
        { error: '异议尚未初始化流程', code: 'NOT_INITIATED' },
        { status: 400 },
      )
    }

    // 找到当前待处理的任务
    const currentTask = objection.tasks.find((t) => t.status === 'PENDING')
    if (!currentTask) {
      return NextResponse.json(
        { error: '没有待处理的任务', code: 'NO_PENDING_TASK' },
        { status: 400 },
      )
    }

    // 获取流程配置
    const workflow = await prisma.objectionWorkflow.findUnique({
      where: { id: objection.currentWorkflowId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    if (!workflow) {
      return NextResponse.json(
        { error: '流程配置不存在', code: 'WORKFLOW_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 确定下一个步骤
    const nextStep = workflow.steps.find((s) => s.stepOrder === currentTask.stepOrder + 1)
    const isFinalStep = !nextStep

    // 执行处理
    const result = await prisma.$transaction(async (tx) => {
      // 1. 更新当前任务状态
      await tx.objectionTask.update({
        where: { id: currentTask.id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          approverId: operatorId,
          approverName: '系统',
          approvedAt: new Date(),
          approveRemark: remark,
        },
      })

      let objectionStatus = objection.status
      let nextTask = null

      if (action === 'approve') {
        if (isFinalStep) {
          // 最终步骤完成，更新异议状态为已解决
          objectionStatus = 'RESOLVED'
          await tx.objection.update({
            where: { id },
            data: {
              status: 'RESOLVED',
              resolverId: operatorId,
              resolverName: '系统',
              resolvedAt: new Date(),
              resolveRemark: remark || '异议处理完成',
            },
          })

          // 恢复领证记录状态为 ISSUED
          await tx.zjdReceiveRecord.update({
            where: { id: objection.receiveRecordId },
            data: { status: 'ISSUED' },
          })

          // 记录流程节点
          await tx.processNode.create({
            data: {
              receiveRecordId: objection.receiveRecordId,
              nodeType: 'RESOLVE',
              nodeName: '异议已解决',
              operatorId,
              operatorName: '系统',
              description: `异议处理完成，最终步骤【${currentTask.stepName}】已审批`,
            },
          })
        } else {
          // 有下一步，创建下一个任务
          await tx.objection.update({
            where: { id },
            data: { currentStepOrder: nextStep.stepOrder },
          })

          nextTask = await tx.objectionTask.create({
            data: {
              objectionId: id,
              stepId: nextStep.id,
              stepOrder: nextStep.stepOrder,
              stepName: nextStep.stepName,
              stepType: nextStep.stepType,
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
              nodeName: nextStep.stepName,
              operatorId,
              operatorName: '系统',
              description: `异议流程进行中，【${currentTask.stepName}】已审批，下一步：【${nextStep.stepName}】`,
            },
          })
        }
      } else {
        // 驳回
        objectionStatus = 'REJECTED'
        await tx.objection.update({
          where: { id },
          data: {
            status: 'REJECTED',
            resolveRemark: remark || '异议被驳回',
          },
        })

        // 恢复领证记录状态为 ISSUED
        await tx.zjdReceiveRecord.update({
          where: { id: objection.receiveRecordId },
          data: { status: 'ISSUED' },
        })

        // 记录流程节点
        await tx.processNode.create({
          data: {
            receiveRecordId: objection.receiveRecordId,
            nodeType: 'RESOLVE',
            nodeName: '异议已驳回',
            operatorId,
            operatorName: '系统',
            description: `异议被驳回，备注：${remark || '无'}`,
          },
        })
      }

      return {
        taskId: currentTask.id,
        action,
        objectionStatus,
        nextTask: nextTask
          ? {
              id: nextTask.id,
              stepOrder: nextTask.stepOrder,
              stepName: nextTask.stepName,
              status: nextTask.status,
            }
          : null,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        taskId: result.taskId,
        action: result.action,
        objectionStatus: result.objectionStatus,
        nextStep: result.nextTask,
      },
    })
  } catch (error) {
    console.error('Execute process error:', error)
    return NextResponse.json({ error: '执行处理失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(['objection:write'])(executeProcessHandler)
