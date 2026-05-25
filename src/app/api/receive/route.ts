/**
 * 领证记录 API
 * GET    /api/receive - 获取领证记录列表
 * POST   /api/receive - 创建领证记录（单个）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptAndMaskRecords } from '@/lib/utils/batch-decrypt'
import { bdcMatchesCertNo, getCertNoSearchKey } from '@/lib/utils/cert-no'
import { withPermission } from '@/lib/api/withPermission'
import { getUserFromRequest } from '@/lib/middleware/auth'
import { getDataPermissionFilter, buildBdcWhereClause } from '@/lib/auth/data-permission'
import { z } from 'zod'

const createReceiveSchema = z
  .object({
    bdcId: z.string().optional(),
    certNo: z.string().optional(),
    idCard: z.string().optional(),
    phone: z.string().optional(),
    remark: z.string().optional(),
  })
  .refine((data) => data.bdcId || data.certNo || data.idCard || data.phone, {
    message: '请提供宅基地 ID、证书编号、身份证号或手机号',
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
    const townId = searchParams.get('townId')
    const villageId = searchParams.get('villageId')

    // 验证 status 白名单
    const validStatuses = ['PENDING', 'ISSUED', 'COMPLETED', 'OBJECTION', 'CANCELLED']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: '无效的状态值', code: 'INVALID_STATUS' }, { status: 400 })
    }

    // 构建查询条件
    const andFilters: Record<string, unknown>[] = []

    if (status) {
      andFilters.push({ status })
    }

    if (bdcId) {
      andFilters.push({ bdcId })
    }

    if (townId) {
      andFilters.push({ bdc: { village: { townId } } })
    }

    if (villageId) {
      andFilters.push({ bdc: { villageId } })
    }

    // 关键词搜索（领取人姓名、证书编号）
    if (keyword) {
      const certNoSearchKey = getCertNoSearchKey(keyword)
      andFilters.push({
        OR: [
          { receiverName: { contains: keyword } },
          { bdc: { certNo: { contains: keyword } } },
          { bdc: { certNos: { contains: keyword } } },
          ...(certNoSearchKey && certNoSearchKey !== keyword
            ? [{ bdc: { certNo: { contains: certNoSearchKey } } }]
            : []),
          ...(certNoSearchKey && certNoSearchKey !== keyword
            ? [{ bdc: { certNos: { contains: certNoSearchKey } } }]
            : []),
          { bdc: { ownerName: { contains: keyword } } },
        ],
      })
    }

    const where: Record<string, unknown> = {}
    if (andFilters.length > 0) {
      where.AND = andFilters
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

    const { bdcId, certNo, idCard, phone, remark } = validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    const where: Record<string, unknown> = {}
    if (bdcId) {
      where.id = bdcId
    } else if (certNo) {
      const trimmedCertNo = certNo.trim()
      const searchKey = getCertNoSearchKey(trimmedCertNo)
      where.OR = [
        { certNo: trimmedCertNo },
        { certNos: { contains: trimmedCertNo } },
        ...(searchKey && searchKey !== trimmedCertNo ? [{ certNo: { contains: searchKey } }] : []),
        ...(searchKey && searchKey !== trimmedCertNo ? [{ certNos: { contains: searchKey } }] : []),
      ]
    } else if (idCard) {
      where.idCard = idCard
    } else if (phone) {
      where.phone = phone
    }

    where.deletedAt = null

    const { userId } = getUserFromRequest(request)
    if (userId) {
      const filter = await getDataPermissionFilter(userId)
      const dataWhere = buildBdcWhereClause(filter)
      Object.assign(where, dataWhere)
    }

    // 检查宅基地是否存在
    const matchedBdcs = await prisma.zjdBdc.findMany({
      where,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(certNo ? {} : { take: 2 }),
    })

    const exactMatchedBdcs = certNo
      ? matchedBdcs.filter((bdc) => bdcMatchesCertNo(bdc, certNo))
      : matchedBdcs

    if (exactMatchedBdcs.length === 0) {
      return NextResponse.json({ error: '宅基地不存在', code: 'BDC_NOT_FOUND' }, { status: 404 })
    }

    if (exactMatchedBdcs.length > 1) {
      return NextResponse.json(
        { error: '匹配到多条宅基地资料，请使用证书编号精确关联', code: 'BDC_AMBIGUOUS' },
        { status: 409 },
      )
    }

    const bdc = exactMatchedBdcs[0]

    // 检查是否已有待领证记录
    const existingRecord = await prisma.zjdReceiveRecord.findFirst({
      where: {
        bdcId: bdc.id,
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
          bdcId: bdc.id,
          status: 'ISSUED',
          issueDate: new Date(),
          remark,
          createdBy: operatorId,
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
export const POST = withPermission(['receive:create'], ['ADMIN', 'RECEIVE_CLERK'], {
  module: 'RECEIVE',
})(createReceiveRecordHandler)
