/**
 * 异议审批流程配置 API
 * GET    /api/objection-workflow - 获取流程列表
 * POST   /api/objection-workflow - 创建流程配置
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

const workflowSchema = z.object({
  name: z.string().min(1, '流程名称不能为空').max(50, '流程名称不能超过 50 字'),
  description: z.string().max(200).optional(),
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
    .min(1, '至少需要配置一个步骤'),
})

// GET - 获取流程列表
async function getWorkflowListHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('isActive')

    const where: Record<string, unknown> = {}
    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    const workflows = await prisma.objectionWorkflow.findMany({
      where,
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: workflows })
  } catch (error) {
    console.error('Get workflow list error:', error)
    return NextResponse.json({ error: '获取流程列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(['objection:manage'])(getWorkflowListHandler)

// POST - 创建流程配置
async function createWorkflowHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = workflowSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { name, description, steps } = validationResult.data

    const workflow = await prisma.objectionWorkflow.create({
      data: {
        name,
        description,
        isActive: true,
        steps: {
          create: steps.map((step) => ({
            stepOrder: step.stepOrder,
            stepName: step.stepName,
            stepType: step.stepType,
            approverRole: step.approverRole,
            isRequired: step.isRequired,
          })),
        },
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    })

    return NextResponse.json({ success: true, data: workflow })
  } catch (error) {
    console.error('Create workflow error:', error)
    return NextResponse.json({ error: '创建流程失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(['objection:manage'])(createWorkflowHandler)
