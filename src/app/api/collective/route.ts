/**
 * 村集体所有权证书 API
 * GET    /api/collective - 获取证书列表
 * POST   /api/collective - 创建证书（入库申请）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { decryptAndMaskRecords } from '@/lib/utils/batch-decrypt'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

// 创建证书验证 schema
const createCertSchema = z.object({
  certNo: z.string().min(1, '证书编号不能为空'),
  ownerName: z.string().min(1, '所有权人名称不能为空'),
  ownerType: z.enum(['VILLAGE_COLLECTIVE', 'TOWN_COLLECTIVE']).default('VILLAGE_COLLECTIVE'),
  villageId: z.string().min(1, '村居不能为空'),
  idCard: z.string().length(18, '身份证号格式不正确').optional(),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
    .optional(),
  address: z.string().min(1, '地址不能为空'),
  area: z.number().positive('面积必须为正数'),
  landUseType: z.string().optional(),
  certIssueDate: z.string().optional(),
  certExpiryDate: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  remark: z.string().optional(),
})

// GET - 获取证书列表
async function getCollectiveListHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '10'), 100)
    const status = searchParams.get('status')
    const villageId = searchParams.get('villageId')
    const ownerType = searchParams.get('ownerType')
    const keyword = searchParams.get('keyword') || ''

    // 验证 status 白名单
    const validStatuses = [
      'IN_STOCK',
      'OUT_STOCK',
      'RETURNED',
      'CANCELLED',
      'FROZEN',
      'PENDING_APPROVE',
    ]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: '无效的状态值', code: 'INVALID_STATUS' }, { status: 400 })
    }

    // 构建查询条件
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (villageId) {
      where.villageId = villageId
    }

    if (ownerType) {
      where.ownerType = ownerType
    }

    // 关键词搜索（证书编号、所有权人名称）
    if (keyword) {
      where.OR = [{ certNo: { contains: keyword } }, { ownerName: { contains: keyword } }]
    }

    const [total, certs] = await Promise.all([
      prisma.collectiveCert.count({ where }),
      prisma.collectiveCert.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          village: {
            include: {
              town: {
                select: { id: true, name: true },
              },
            },
          },
          operations: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // 解密敏感字段并脱敏（使用批量解密工具函数）
    const sanitizedCerts = await decryptAndMaskRecords(certs, [
      { field: 'idCard', maskType: 'idCard' },
      { field: 'phone', maskType: 'phone' },
    ])

    // 移除 hash 字段
    const finalCerts = sanitizedCerts.map((cert) => ({
      ...cert,
      idCardHash: undefined,
      phoneHash: undefined,
    }))

    return NextResponse.json({
      success: true,
      data: {
        list: finalCerts,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get collective certs error:', error)
    return NextResponse.json({ error: '获取证书列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(
  ['collective:read'],
  ['ADMIN', 'COLLECTIVE_MANAGER'],
)(getCollectiveListHandler)

// POST - 创建证书（入库申请）
async function createCollectiveCertHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createCertSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const data = validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查证书编号是否已存在
    const existingCert = await prisma.collectiveCert.findUnique({
      where: { certNo: data.certNo },
    })

    if (existingCert) {
      return NextResponse.json({ error: '证书编号已存在', code: 'CERT_NO_EXISTS' }, { status: 409 })
    }

    // 检查村居是否存在
    const village = await prisma.sysVillage.findUnique({
      where: { id: data.villageId },
    })

    if (!village) {
      return NextResponse.json({ error: '村居不存在', code: 'VILLAGE_NOT_FOUND' }, { status: 404 })
    }

    // 加密敏感字段
    let encryptedIdCard: string | undefined
    let idCardHash: string | undefined
    let encryptedPhone: string | undefined
    let phoneHash: string | undefined

    if (data.idCard) {
      const encrypted = await encryptSensitiveField(data.idCard)
      encryptedIdCard = encrypted.encrypted
      idCardHash = encrypted.hash
    }

    if (data.phone) {
      const encrypted = await encryptSensitiveField(data.phone)
      encryptedPhone = encrypted.encrypted
      phoneHash = encrypted.hash
    }

    // 创建证书
    const cert = await prisma.collectiveCert.create({
      data: {
        certNo: data.certNo,
        ownerName: data.ownerName,
        ownerType: data.ownerType,
        villageId: data.villageId,
        idCard: encryptedIdCard,
        idCardHash,
        phone: encryptedPhone,
        phoneHash,
        address: data.address,
        area: data.area,
        landUseType: data.landUseType,
        certIssueDate: data.certIssueDate ? new Date(data.certIssueDate) : undefined,
        certExpiryDate: data.certExpiryDate ? new Date(data.certExpiryDate) : undefined,
        attachments: data.attachments ? JSON.stringify(data.attachments) : undefined,
        remark: data.remark,
        status: 'PENDING_APPROVE',
        stockBy: operatorId,
        createdBy: operatorId,
      },
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    // 创建操作记录
    await prisma.certOperation.create({
      data: {
        certId: cert.id,
        operationType: 'STOCK_APPLY',
        operatorId,
        operatorName: '系统',
        description: '提交入库申请',
        metadata: JSON.stringify({
          certNo: data.certNo,
          ownerName: data.ownerName,
        }),
      },
    })

    return NextResponse.json({ success: true, data: cert })
  } catch (error) {
    console.error('Create collective cert error:', error)
    return NextResponse.json({ error: '创建证书失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(
  ['collective:create'],
  ['ADMIN', 'COLLECTIVE_MANAGER'],
)(createCollectiveCertHandler)
