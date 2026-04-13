/**
 * 领证记录 API
 * GET    /api/receive - 获取领证记录列表
 * POST   /api/receive - 创建领证记录（单个）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'
import { z } from 'zod'

const createReceiveSchema = z.object({
  bdcId: z.string().uuid('宅基地 ID 格式不正确'),
  remark: z.string().optional(),
})

// GET - 获取领证记录列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '10'), 100)
    const status = searchParams.get('status')
    const keyword = searchParams.get('keyword') || ''
    const bdcId = searchParams.get('bdcId')

    // 验证 status 白名单
    const validStatuses = ['PENDING', 'ISSUED', 'COMPLETED', 'OBJECTION', 'CANCELLED']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: '无效的状态值', code: 'INVALID_STATUS' }, { status: 400 })
    }

    // 构建查询条件
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (bdcId) {
      where.bdcId = bdcId
    }

    // 关键词搜索（领取人姓名、证书编号）
    if (keyword) {
      where.OR = [
        { receiverName: { contains: keyword } },
        { bdc: { certNo: { contains: keyword } } },
        { bdc: { ownerName: { contains: keyword } } },
      ]
    }

    const [total, records] = await Promise.all([
      prisma.zjdReceiveRecord.count({ where }),
      prisma.zjdReceiveRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          bdc: {
            include: {
              village: {
                include: {
                  town: {
                    select: { name: true },
                  },
                },
              },
            },
          },
          processNodes: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // 解密敏感字段并脱敏
    const sanitizedRecords = await Promise.all(
      records.map(async (record) => {
        let receiverIdCard = record.receiverIdCard
        let receiverPhone = record.receiverPhone

        // 解密并脱敏
        if (receiverIdCard) {
          try {
            const decrypted = await decryptSensitiveField(receiverIdCard)
            receiverIdCard = maskIdCard(decrypted)
          } catch {
            receiverIdCard = '解密失败'
          }
        }

        if (receiverPhone) {
          try {
            const decrypted = await decryptSensitiveField(receiverPhone)
            receiverPhone = maskPhone(decrypted)
          } catch {
            receiverPhone = '解密失败'
          }
        }

        return {
          ...record,
          receiverIdCard,
          receiverPhone,
          // 不返回加密字段
          idCardFrontPhoto: undefined,
          idCardBackPhoto: undefined,
          scenePhoto: undefined,
        }
      }),
    )

    return NextResponse.json({
      success: true,
      data: {
        list: sanitizedRecords,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get receive records error:', error)
    return NextResponse.json(
      { error: '获取领证记录列表失败', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}

// POST - 创建领证记录（单个）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createReceiveSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { bdcId, remark } = validationResult.data

    // 检查宅基地是否存在
    const bdc = await prisma.zjdBdc.findUnique({
      where: { id: bdcId },
    })

    if (!bdc) {
      return NextResponse.json({ error: '宅基地不存在', code: 'BDC_NOT_FOUND' }, { status: 404 })
    }

    // 检查是否已有待领证记录
    const existingRecord = await prisma.zjdReceiveRecord.findFirst({
      where: {
        bdcId,
        status: { in: ['PENDING', 'ISSUED'] },
      },
    })

    if (existingRecord) {
      return NextResponse.json(
        { error: '该宅基地已有待处理领证记录', code: 'RECORD_EXISTS' },
        { status: 409 },
      )
    }

    // 创建领证记录
    const record = await prisma.zjdReceiveRecord.create({
      data: {
        bdcId,
        status: 'PENDING',
        remark,
        createdBy: 'system',
      },
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
    await prisma.processNode.create({
      data: {
        receiveRecordId: record.id,
        nodeType: 'IMPORT',
        nodeName: '导入待领证',
        operatorId: 'system',
        operatorName: '系统',
        description: '手动创建领证记录',
      },
    })

    return NextResponse.json({ success: true, data: record })
  } catch (error) {
    console.error('Create receive record error:', error)
    return NextResponse.json({ error: '创建领证记录失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
