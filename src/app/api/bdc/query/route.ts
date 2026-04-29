/**
 * 宅基地查询 API
 * GET /api/bdc/query - 通过身份证号或手机号查询宅基地
 * 权限要求：需要 bdc:query 权限或管理员角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveKey } from '@/lib/kms'
import { sm3Hmac } from '@/lib/gm-crypto'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'
import { withPermission } from '@/lib/api/withPermission'
import { getUserFromRequest } from '@/lib/middleware/auth'
import { getDataPermissionFilter, buildBdcWhereClause } from '@/lib/auth/data-permission'
import { z } from 'zod'

const querySchema = z.object({
  idCard: z.string().optional(),
  phone: z.string().optional(),
})

async function getBdcQueryHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const idCard = searchParams.get('idCard')
    const phone = searchParams.get('phone')

    if (!idCard && !phone) {
      return NextResponse.json(
        { error: '请提供身份证号或手机号', code: 'MISSING_QUERY_PARAM' },
        { status: 400 },
      )
    }

    const where: Record<string, unknown> = {}

    // 获取主密钥用于生成哈希
    const masterKeyRecord = await getActiveKey('MASTER_KEY')

    // 通过身份证号查询
    if (idCard) {
      const idCardHash = sm3Hmac(idCard, masterKeyRecord.keyData)
      where.idCardHash = idCardHash
    }

    // 通过手机号查询
    if (phone) {
      const phoneHash = sm3Hmac(phone, masterKeyRecord.keyData)
      where.phoneHash = phoneHash
    }

    // 应用数据权限过滤
    const { userId } = getUserFromRequest(request)
    if (userId) {
      const filter = await getDataPermissionFilter(userId)
      const dataWhere = buildBdcWhereClause(filter)
      if (Object.keys(dataWhere).length > 0) {
        Object.assign(where, dataWhere)
      }
    }

    const bdcs = await prisma.zjdBdc.findMany({
      where,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // 脱敏处理
    const sanitizedBdcs = bdcs.map((bdc) => ({
      ...bdc,
      idCard: bdc.idCard ? maskIdCard(bdc.idCard) : undefined,
      phone: bdc.phone ? maskPhone(bdc.phone) : undefined,
    }))

    return NextResponse.json({
      success: true,
      data: sanitizedBdcs,
    })
  } catch (error) {
    console.error('Query BDC error:', error)
    return NextResponse.json({ error: '查询失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// 使用 withPermission 包装 GET 方法，要求 ADMIN 或 BDC_MANAGER 角色
export const GET = withPermission([], ['ADMIN', 'BDC_MANAGER'])(getBdcQueryHandler)
