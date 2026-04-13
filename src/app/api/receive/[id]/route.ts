/**
 * 领证记录详情 API
 * GET    /api/receive/[id] - 获取领证记录详情
 * PATCH  /api/receive/[id] - 更新领证记录（发放、领取完成）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField, decryptSensitiveField } from '@/lib/gm-crypto'
import { z } from 'zod'
import { getCurrentUserId } from '@/lib/auth/middleware'

// 身份证验证正则
const ID_CARD_REGEX = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/
// 手机号验证正则
const PHONE_REGEX = /^1[3-9]\d{9}$/

// 更新领证记录 schema
const updateReceiveSchema = z.object({
  // 领取人信息
  receiverName: z.string().optional(),
  receiverIdCard: z
    .string()
    .optional()
    .refine((val) => !val || ID_CARD_REGEX.test(val), '身份证号格式不正确'),
  receiverPhone: z
    .string()
    .optional()
    .refine((val) => !val || PHONE_REGEX.test(val), '手机号格式不正确'),
  // 证件照片（Base64）
  idCardFrontPhoto: z.string().optional(),
  idCardBackPhoto: z.string().optional(),
  // 现场拍照（Base64）
  scenePhoto: z.string().optional(),
  // 状态操作
  action: z.enum(['issue', 'receive', 'cancel']).optional(),
  // 备注
  remark: z.string().optional(),
})

// GET - 获取领证记录详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const record = await prisma.zjdReceiveRecord.findUnique({
      where: { id },
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
        objections: {
          where: { status: 'PENDING' },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: '领证记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 解密敏感字段
    let receiverIdCard = record.receiverIdCard
    let receiverPhone = record.receiverPhone

    if (receiverIdCard) {
      try {
        const decrypted = await decryptSensitiveField(receiverIdCard)
        // 只返回脱敏后的
        receiverIdCard = decrypted.slice(0, 3) + '****' + decrypted.slice(-4)
      } catch {
        receiverIdCard = '解密失败'
      }
    }

    if (receiverPhone) {
      try {
        const decrypted = await decryptSensitiveField(receiverPhone)
        receiverPhone = decrypted.slice(0, 3) + '****' + decrypted.slice(-4)
      } catch {
        receiverPhone = '解密失败'
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        receiverIdCard,
        receiverPhone,
        // 照片字段不返回完整内容，只返回是否有照片
        hasIdCardFront: !!record.idCardFrontPhoto,
        hasIdCardBack: !!record.idCardBackPhoto,
        hasScenePhoto: !!record.scenePhoto,
        idCardFrontPhoto: undefined,
        idCardBackPhoto: undefined,
        scenePhoto: undefined,
      },
    })
  } catch (error) {
    console.error('Get receive record error:', error)
    return NextResponse.json(
      { error: '获取领证记录详情失败', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}

// PATCH - 更新领证记录
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = updateReceiveSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const {
      receiverName,
      receiverIdCard,
      receiverPhone,
      idCardFrontPhoto,
      idCardBackPhoto,
      scenePhoto,
      action,
      remark,
    } = validationResult.data

    const operatorId = await getCurrentUserId(request)

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 查找记录
    const record = await prisma.zjdReceiveRecord.findUnique({
      where: { id },
      include: { bdc: true },
    })

    if (!record) {
      return NextResponse.json({ error: '领证记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}
    const processNodeData: Record<string, unknown> = {}

    // 处理状态操作
    if (action) {
      switch (action) {
        case 'issue': // 发放
          if (record.status !== 'PENDING') {
            return NextResponse.json(
              { error: '当前状态不允许发放', code: 'INVALID_STATUS' },
              { status: 400 },
            )
          }
          updateData.status = 'ISSUED'
          updateData.issueDate = new Date()
          processNodeData.nodeType = 'ISSUE'
          processNodeData.nodeName = '证书发放'
          processNodeData.description = '证书已发放给领取人'
          break

        case 'receive': // 领取完成
          if (record.status !== 'ISSUED') {
            return NextResponse.json(
              { error: '当前状态不允许确认领取', code: 'INVALID_STATUS' },
              { status: 400 },
            )
          }
          if (!receiverName || !receiverIdCard) {
            return NextResponse.json(
              { error: '领取人信息不能为空', code: 'MISSING_INFO' },
              { status: 400 },
            )
          }
          updateData.status = 'COMPLETED'
          updateData.receiveDate = new Date()
          updateData.receiverName = receiverName
          updateData.signedBy = receiverName
          updateData.signedDate = new Date()
          processNodeData.nodeType = 'COMPLETE'
          processNodeData.nodeName = '领取完成'
          processNodeData.description = `领取人：${receiverName}`

          // 更新宅基地状态为 ISSUED
          await prisma.zjdBdc.update({
            where: { id: record.bdcId },
            data: { status: 'ISSUED' },
          })
          break

        case 'cancel': // 取消
          updateData.status = 'CANCELLED'
          processNodeData.nodeType = 'CANCEL'
          processNodeData.nodeName = '取消领证'
          processNodeData.description = remark || '取消领证'
          break
      }
    }

    // 处理领取人信息加密
    if (receiverIdCard) {
      const result = await encryptSensitiveField(receiverIdCard)
      updateData.receiverIdCard = result.encrypted
      updateData.receiverIdCardHash = result.hash
    }

    if (receiverPhone) {
      const result = await encryptSensitiveField(receiverPhone)
      updateData.receiverPhone = result.encrypted
      updateData.receiverPhoneHash = result.hash
    }

    // 处理照片
    if (idCardFrontPhoto) {
      updateData.idCardFrontPhoto = idCardFrontPhoto
    }
    if (idCardBackPhoto) {
      updateData.idCardBackPhoto = idCardBackPhoto
    }
    if (scenePhoto) {
      updateData.scenePhoto = scenePhoto
    }

    // 处理备注
    if (remark !== undefined) {
      updateData.remark = remark
    }

    // 使用事务更新记录和创建流程节点
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const updated = await tx.zjdReceiveRecord.update({
        where: { id },
        data: updateData,
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
      })

      // 创建流程节点
      if (processNodeData.nodeType) {
        await tx.processNode.create({
          data: {
            receiveRecordId: id,
            nodeType: processNodeData.nodeType as string,
            nodeName: processNodeData.nodeName as string,
            operatorId,
            operatorName: '系统',
            description: processNodeData.description as string,
          },
        })
      }

      return updated
    })

    return NextResponse.json({ success: true, data: updatedRecord })
  } catch (error) {
    console.error('Update receive record error:', error)
    return NextResponse.json({ error: '更新领证记录失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
