/**
 * 领证记录 API
 * GET    /api/receive - 获取领证记录列表
 * POST   /api/receive - 创建领证记录（单个）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptAndMaskRecords } from '@/lib/utils/batch-decrypt'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

const createReceiveSchema = z.object({
  bdcId: z.string().min(1, '宅基地 ID 不能为空'),
  remark: z.string().optional(),
})

// GET - 获取领证记录列表
async function getReceiveRecordsListHandler(request: NextRequest) {
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
          objections: {
            where: { status: { in: ['PENDING', 'PROCESSING'] } },
            take: 1,
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // 解密敏感字段并脱敏（使用批量解密工具函数）
    const decryptedRecords = await decryptAndMaskRecords(records, [
      { field: 'receiverIdCard', maskType: 'idCard' },
      { field: 'receiverPhone', maskType: 'phone' },
    ])

    const sanitizedRecords = decryptedRecords.map((record, index) => ({
      id: record.id,
      bdcId: record.bdcId,
      status: record.status,
      receiverName: record.receiverName,
      receiverIdCard: record.receiverIdCard,
      receiverPhone: record.receiverPhone,
      remark: record.remark,
      applyDate: record.applyDate,
      issueDate: record.issueDate,
      receiveDate: record.receiveDate,
      signedBy: record.signedBy,
      signedDate: record.signedDate,
      bdc: record.bdc,
      processNodes: record.processNodes,
      // 从原始记录获取 objections（decryptAndMaskRecords 不保留数组类型）
      hasObjection: (records[index].objections as unknown[])?.length > 0,
      activeObjectionId:
        ((records[index].objections as unknown[])?.[0] as { id?: string })?.id || null,
    }))

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
export const GET = withPermission(
  ['receive:read'],
  ['ADMIN', 'RECEIVE_CLERK'],
)(getReceiveRecordsListHandler)

// POST - 创建领证记录（单个）
async function createReceiveRecordHandler(request: NextRequest) {
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
        status: 'ISSUED',
      },
    })

    if (existingRecord) {
      return NextResponse.json(
        { error: '该宅基地已有待处理领证记录', code: 'RECORD_EXISTS' },
        { status: 409 },
      )
    }

    // 使用事务创建领证记录和流程节点
    const record = await prisma.$transaction(async (tx) => {
      const newRecord = await tx.zjdReceiveRecord.create({
        data: {
          bdcId,
          status: 'ISSUED',
          issueDate: new Date(),
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

      await tx.processNode.create({
        data: {
          receiveRecordId: newRecord.id,
          nodeType: 'ISSUE',
          nodeName: '手动创建（已发放）',
          operatorId: 'system',
          operatorName: '系统',
          description: '手动创建领证记录，已自动发放',
        },
      })

      return newRecord
    })

    return NextResponse.json({ success: true, data: record })
  } catch (error) {
    console.error('Create receive record error:', error)
    return NextResponse.json({ error: '创建领证记录失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(
  ['receive:create'],
  ['ADMIN', 'RECEIVE_CLERK'],
)(createReceiveRecordHandler)
