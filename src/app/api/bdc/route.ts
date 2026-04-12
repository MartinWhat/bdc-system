/**
 * 宅基地管理 API
 * GET    /api/bdc - 获取宅基地列表
 * POST   /api/bdc - 创建宅基地档案
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField, generateQueryHash } from '@/lib/gm-crypto'
import { getDataPermissionFilter, buildBdcWhereClause } from '@/lib/auth/data-permission'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'
import { z } from 'zod'

const createBdcSchema = z.object({
  villageId: z.string().min(1, '所属村居不能为空'),
  certNo: z.string().min(1, '证书编号不能为空'),
  ownerName: z.string().min(1, '使用权人姓名不能为空'),
  idCard: z.string().min(1, '身份证号不能为空'),
  phone: z.string().optional(),
  address: z.string().min(1, '地址不能为空'),
  area: z.number().positive('面积必须大于0'),
  landUseType: z.string().min(1, '土地用途不能为空'),
  approvedArea: z.number().optional(),
  approvedDate: z.string().optional(),
  remark: z.string().optional(),
})

// GET - 获取宅基地列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const keyword = searchParams.get('keyword') || ''
    const status = searchParams.get('status')
    const villageId = searchParams.get('villageId')
    const userId = request.headers.get('x-user-id')

    // 构建基础查询条件
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (villageId) {
      where.villageId = villageId
    }

    // 关键词搜索（姓名、证书编号）
    if (keyword) {
      where.OR = [
        { ownerName: { contains: keyword } },
        { certNo: { contains: keyword } },
        { address: { contains: keyword } },
      ]
    }

    // 应用数据权限过滤
    if (userId) {
      const filter = await getDataPermissionFilter(userId)
      const dataWhere = buildBdcWhereClause(filter)
      Object.assign(where, dataWhere)
    }

    const [total, bdcs] = await Promise.all([
      prisma.zjdBdc.count({ where }),
      prisma.zjdBdc.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          village: {
            include: {
              town: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // 脱敏处理
    const sanitizedBdcs = bdcs.map((bdc) => ({
      ...bdc,
      idCard: bdc.idCard ? maskIdCard(bdc.idCard) : undefined,
      phone: bdc.phone ? maskPhone(bdc.phone) : undefined,
    }))

    return NextResponse.json({
      success: true,
      data: {
        list: sanitizedBdcs,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get BDC list error:', error)
    return NextResponse.json({ error: '获取宅基地列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建宅基地档案
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createBdcSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const {
      villageId,
      certNo,
      ownerName,
      idCard,
      phone,
      address,
      area,
      landUseType,
      approvedArea,
      approvedDate,
      remark,
    } = validationResult.data

    // 检查证书编号是否已存在
    const existingBdc = await prisma.zjdBdc.findUnique({
      where: { certNo },
    })

    if (existingBdc) {
      return NextResponse.json({ error: '证书编号已存在', code: 'CERT_NO_EXISTS' }, { status: 409 })
    }

    // 构建创建数据
    const createData = {
      villageId,
      certNo,
      ownerName,
      address,
      area,
      landUseType,
      status: 'PENDING',
      createdBy: request.headers.get('x-user-id') || 'system',
      idCard: '',
      idCardHash: '',
      phone: null as string | null,
      phoneHash: null as string | null,
      approvedArea: approvedArea ?? null,
      approvedDate: approvedDate ? new Date(approvedDate) : null,
      remark: remark ?? null,
    }

    // 加密身份证号
    const idCardResult = await encryptSensitiveField(idCard)
    createData.idCard = idCardResult.encrypted
    createData.idCardHash = idCardResult.hash

    // 加密手机号（如果有）
    if (phone) {
      const phoneResult = await encryptSensitiveField(phone)
      createData.phone = phoneResult.encrypted
      createData.phoneHash = phoneResult.hash
    }

    const bdc = await prisma.zjdBdc.create({
      data: createData,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: bdc,
    })
  } catch (error: any) {
    console.error('Create BDC error:', error)
    return NextResponse.json({ error: '创建宅基地档案失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
