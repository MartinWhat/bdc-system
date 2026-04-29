/**
 * 异议审批流程详情 API
 * GET    /api/objection-workflow/[id] - 获取流程详情
 * PUT    /api/objection-workflow/[id] - 更新流程配置
 * DELETE /api/objection-workflow/[id] - 删除流程配置
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

const workflowSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        stepOrder: z.number().int().positive(),
        stepName: z.string().min(1).max(20),
        stepType: z.enum(['SUBMIT', 'REVIEW', 'RE_REVIEW', 'FINAL']),
        approverRole: z.string().optional(),
        isRequired: z.boolean().default(true),
      }),
    )
    .min(1),
})

// GET - 获取流程详情
async function getWorkflowHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const workflow = await prisma.objectionWorkflow.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: '流程不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: workflow })
  } catch (error) {
    console.error('Get workflow error:', error)
    return NextResponse.json({ error: '获取流程详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(['objection:manage'])(getWorkflowHandler)

// PUT - 更新流程配置
async function updateWorkflowHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = workflowSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { name, description, isActive, steps } = validationResult.data

    // 检查流程是否存在
    const existing = await prisma.objectionWorkflow.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '流程不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 使用事务更新流程和步骤
    const workflow = await prisma.$transaction(async (tx) => {
      // 更新流程基本信息
      await tx.objectionWorkflow.update({
        where: { id },
        data: { name, description, isActive },
      })

      // 删除旧步骤
      await tx.objectionWorkflowStep.deleteMany({ where: { workflowId: id } })

      // 创建新步骤
      await tx.objectionWorkflowStep.createMany({
        data: steps.map((step) => ({
          workflowId: id,
          stepOrder: step.stepOrder,
          stepName: step.stepName,
          stepType: step.stepType,
          approverRole: step.approverRole,
          isRequired: step.isRequired,
        })),
      })

      return tx.objectionWorkflow.findUnique({
        where: { id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      })
    })

    return NextResponse.json({ success: true, data: workflow })
  } catch (error) {
    console.error('Update workflow error:', error)
    return NextResponse.json({ error: '更新流程失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const PUT = withPermission(['objection:manage'])(updateWorkflowHandler)

// DELETE - 删除流程配置
async function deleteWorkflowHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // 检查流程是否存在
    const existing = await prisma.objectionWorkflow.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '流程不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 检查是否有异议正在使用此流程
    const objectionInUse = await prisma.objection.findFirst({
      where: { currentWorkflowId: id },
    })

    if (objectionInUse) {
      return NextResponse.json(
        { error: '该流程正在被使用，无法删除', code: 'WORKFLOW_IN_USE' },
        { status: 400 },
      )
    }

    await prisma.objectionWorkflow.delete({ where: { id } })

    return NextResponse.json({ success: true, message: '流程已删除' })
  } catch (error) {
    console.error('Delete workflow error:', error)
    return NextResponse.json({ error: '删除流程失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const DELETE = withPermission(['objection:manage'])(deleteWorkflowHandler)
