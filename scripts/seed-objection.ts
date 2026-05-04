/**
 * 异议处理流程和异议假数据生成脚本
 * 使用方法：npx tsx scripts/seed-objection.ts
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

// 工作流程配置
const WORKFLOW_CONFIG = {
  name: '标准异议处理流程',
  description: '异议申请 -> 初审 -> 复审 -> 核定',
  steps: [
    { stepOrder: 1, stepName: '异议受理', stepType: 'RECEIVE' },
    { stepOrder: 2, stepName: '初审核实', stepType: 'VERIFY' },
    { stepOrder: 3, stepName: '复审审批', stepType: 'APPROVE' },
    { stepOrder: 4, stepName: '最终核定', stepType: 'FINALIZE' },
  ],
}

async function seedObjectionWorkflow() {
  console.log('\n📍 创建异议处理流程...')

  // 检查是否已存在
  const existing = await prisma.objectionWorkflow.findFirst({
    where: { name: WORKFLOW_CONFIG.name },
  })

  if (existing) {
    console.log(`  ⚠️  流程【${WORKFLOW_CONFIG.name}】已存在，跳过`)
    return existing
  }

  // 创建流程
  const workflow = await prisma.objectionWorkflow.create({
    data: {
      name: WORKFLOW_CONFIG.name,
      description: WORKFLOW_CONFIG.description,
      isActive: true,
      steps: {
        create: WORKFLOW_CONFIG.steps.map((step) => ({
          stepOrder: step.stepOrder,
          stepName: step.stepName,
          stepType: step.stepType,
        })),
      },
    },
    include: { steps: true },
  })

  console.log(`  ✅ 创建流程【${workflow.name}】（${workflow.steps.length} 步）`)
  return workflow
}

async function seedObjections(workflowId: string) {
  console.log('\n📍 创建异议假数据...')

  // 获取领证记录
  const receiveRecords = await prisma.zjdReceiveRecord.findMany({
    where: {
      status: 'ISSUED',
      deletedAt: null,
    },
    take: 5,
  })

  if (receiveRecords.length === 0) {
    console.log('  ⚠️  没有可用的领证记录，跳过异议创建')
    return
  }

  // 获取系统用户
  const systemUser = await prisma.sysUser.findFirst({
    where: { username: 'system' },
  })

  if (!systemUser) {
    console.log('  ⚠️  未找到系统用户，跳过')
    return
  }

  const objectionTypes = ['权属争议', '面积异议', '地址错误', '证件遗失']
  const descriptions = [
    '该证书所有权人有争议，需要重新核实',
    '证书面积与实际面积不符，相差约 50 平方米',
    '证书地址记录有误，实际地址应为 XX 村 XX 组',
    '原证书遗失，申请补办',
  ]

  const statuses = ['PENDING', 'IN_PROGRESS', 'RESOLVED']

  for (let i = 0; i < receiveRecords.length; i++) {
    const record = receiveRecords[i]
    const objectionType = objectionTypes[i % objectionTypes.length]
    const description = descriptions[i % descriptions.length]
    const status = statuses[i % statuses.length]

    // 检查是否已有异议
    const existingObjection = await prisma.objection.findFirst({
      where: { receiveRecordId: record.id },
    })

    if (existingObjection) {
      console.log(`  ⚠️  领证记录 ${record.id} 已有异议，跳过`)
      continue
    }

    // 创建异议并启动流程
    const objection = await prisma.objection.create({
      data: {
        receiveRecordId: record.id,
        objectionType,
        description,
        contactName: '张三',
        contactPhone: '13800138000',
        status,
        currentWorkflowId: workflowId,
        currentStepOrder: status === 'PENDING' ? 1 : status === 'IN_PROGRESS' ? 2 : 4,
      },
    })

    // 创建流程任务
    if (status !== 'PENDING') {
      // 获取流程步骤
      const steps = await prisma.objectionWorkflowStep.findMany({
        where: { workflowId },
        orderBy: { stepOrder: 'asc' },
      })

      const firstStep = steps[0]
      await prisma.objectionTask.create({
        data: {
          objectionId: objection.id,
          stepId: firstStep.id,
          stepOrder: firstStep.stepOrder,
          stepName: firstStep.stepName,
          stepType: firstStep.stepType,
          status: 'APPROVED',
          approverId: systemUser.id,
          approverName: systemUser.realName || 'system',
          approvedAt: new Date(),
        },
      })

      if (status === 'IN_PROGRESS') {
        const secondStep = steps[1]
        await prisma.objectionTask.create({
          data: {
            objectionId: objection.id,
            stepId: secondStep.id,
            stepOrder: secondStep.stepOrder,
            stepName: secondStep.stepName,
            stepType: secondStep.stepType,
            status: 'PENDING',
          },
        })
      }

      if (status === 'RESOLVED') {
        // 完成所有步骤
        for (let j = 1; j < steps.length; j++) {
          const step = steps[j]
          await prisma.objectionTask.create({
            data: {
              objectionId: objection.id,
              stepId: step.id,
              stepOrder: step.stepOrder,
              stepName: step.stepName,
              stepType: step.stepType,
              status: 'APPROVED',
              approverId: systemUser.id,
              approverName: systemUser.realName || 'system',
              approvedAt: new Date(Date.now() - (steps.length - j) * 3600000),
              approveRemark: j === steps.length - 1 ? '异议已核实解决' : undefined,
            },
          })
        }

        // 更新异议为已解决
        await prisma.objection.update({
          where: { id: objection.id },
          data: {
            resolveRemark: '异议经核实已解决，证书信息已更正',
            resolverId: systemUser.id,
            resolverName: systemUser.realName || 'system',
            resolvedAt: new Date(),
          },
        })
      }
    } else {
      // PENDING 状态创建第一步任务
      const steps = await prisma.objectionWorkflowStep.findMany({
        where: { workflowId },
        orderBy: { stepOrder: 'asc' },
      })
      const firstStep = steps[0]
      await prisma.objectionTask.create({
        data: {
          objectionId: objection.id,
          stepId: firstStep.id,
          stepOrder: firstStep.stepOrder,
          stepName: firstStep.stepName,
          stepType: firstStep.stepType,
          status: 'PENDING',
        },
      })
    }

    console.log(`  ✅ ${objectionType} (${status}) - 第 ${objection.currentStepOrder} 步`)
  }
}

async function main() {
  console.log('🌱 开始生成异议假数据...\n')

  // 1. 创建工作流程
  const workflow = await seedObjectionWorkflow()

  // 2. 创建异议数据
  await seedObjections(workflow.id)

  // 统计
  const objectionCount = await prisma.objection.count()
  const workflowCount = await prisma.objectionWorkflow.count()

  console.log('\n📊 数据统计:')
  console.log(`  - 工作流程：${workflowCount} 条`)
  console.log(`  - 异议记录：${objectionCount} 条`)
  console.log('\n✅ 异议假数据生成完成！')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
