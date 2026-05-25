/**
 * 宅基地查询 API
 * GET /api/bdc/query - 通过身份证号、手机号或证书编号查询宅基地
 * 权限要求：需要 bdc:query 权限或管理员角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'
import { bdcMatchesCertNo, getCertNoSearchKey } from '@/lib/utils/cert-no'
import { withPermission } from '@/lib/api/withPermission'
import { getUserFromRequest } from '@/lib/middleware/auth'
import { getDataPermissionFilter, buildBdcWhereClause } from '@/lib/auth/data-permission'

async function getBdcQueryHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const idCard = searchParams.get('idCard')
    const phone = searchParams.get('phone')
    const certNo = searchParams.get('certNo')

    if (!idCard && !phone && !certNo) {
      return NextResponse.json(
        { error: '请提供身份证号、手机号或证书编号', code: 'MISSING_QUERY_PARAM' },
        { status: 400 },
      )
    }

    const where: Record<string, unknown> = {}
    const andFilters: Record<string, unknown>[] = []

    // 通过身份证号查询
    if (idCard) {
      andFilters.push({ idCard })
    }

    // 通过手机号查询
    if (phone) {
      andFilters.push({ phone })
    }

    if (certNo) {
      const trimmedCertNo = certNo.trim()
      const searchKey = getCertNoSearchKey(trimmedCertNo)
      andFilters.push({
        OR: [
          { certNo: trimmedCertNo },
          { certNos: { contains: trimmedCertNo } },
          ...(searchKey && searchKey !== trimmedCertNo
            ? [{ certNo: { contains: searchKey } }]
            : []),
          ...(searchKey && searchKey !== trimmedCertNo
            ? [{ certNos: { contains: searchKey } }]
            : []),
        ],
      })
    }

    // 应用数据权限过滤
    const { userId } = getUserFromRequest(request)
    if (userId) {
      const filter = await getDataPermissionFilter(userId)
      const dataWhere = buildBdcWhereClause(filter)
      if (Object.keys(dataWhere).length > 0) {
        andFilters.unshift(dataWhere)
      }
    }

    const bdcs = await prisma.zjdBdc.findMany({
      where: andFilters.length > 0 ? { AND: andFilters } : where,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const matchedBdcs = certNo ? bdcs.filter((bdc) => bdcMatchesCertNo(bdc, certNo)) : bdcs

    // 脱敏处理
    const sanitizedBdcs = matchedBdcs.map((bdc) => ({
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
