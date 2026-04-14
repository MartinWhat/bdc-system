/**
 * 村集体证书统计 API
 * GET /api/collective/stats - 统计查询
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const villageId = searchParams.get('villageId')
    const townId = searchParams.get('townId')
    const ownerType = searchParams.get('ownerType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // 构建查询条件
    const where: Record<string, unknown> = {}

    if (villageId) {
      where.villageId = villageId
    }

    if (townId) {
      where.village = { townId }
    }

    if (ownerType) {
      where.ownerType = ownerType
    }

    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    // 按状态统计
    const statusStats = await prisma.collectiveCert.groupBy({
      by: ['status'],
      where,
      _count: true,
    })

    // 按所有权类型统计
    const ownerTypeStats = await prisma.collectiveCert.groupBy({
      by: ['ownerType'],
      where,
      _count: true,
    })

    // 按村居统计（如果没有指定村居）
    let villageStats: Array<{
      villageId: string
      villageName: string
      townName: string
      count: number
    }> = []
    if (!villageId) {
      const rawStats = await prisma.collectiveCert.groupBy({
        by: ['villageId'],
        where,
        _count: true,
      })

      // 获取村居名称
      const villageIds = rawStats.map((v) => v.villageId)
      const villages = await prisma.sysVillage.findMany({
        where: { id: { in: villageIds } },
        include: { town: { select: { name: true } } },
      })

      villageStats = rawStats.map((stat) => {
        const village = villages.find((v) => v.id === stat.villageId)
        return {
          villageId: stat.villageId,
          villageName: village?.name || '未知',
          townName: village?.town?.name || '未知',
          count: stat._count,
        }
      })
    }

    // 总数统计
    const totalCount = await prisma.collectiveCert.count({ where })

    // 冻结数量
    const frozenCount = await prisma.collectiveCert.count({
      where: { ...where, isFrozen: true },
    })

    // 本月入库数量
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthStockCount = await prisma.collectiveCert.count({
      where: {
        ...where,
        stockAt: { gte: monthStart },
      },
    })

    // 本月出库数量
    const monthOutCount = await prisma.collectiveCert.count({
      where: {
        ...where,
        outAt: { gte: monthStart },
      },
    })

    // 本月归还数量
    const monthReturnCount = await prisma.collectiveCert.count({
      where: {
        ...where,
        returnAt: { gte: monthStart },
      },
    })

    // 构建状态映射
    const statusMap: Record<string, string> = {
      IN_STOCK: '在库',
      OUT_STOCK: '已出库',
      RETURNED: '已归还',
      CANCELLED: '已注销',
      FROZEN: '已冻结',
      PENDING_APPROVE: '待审核',
    }

    const formattedStatusStats = statusStats.map((stat) => ({
      status: stat.status,
      statusName: statusMap[stat.status] || stat.status,
      count: stat._count,
    }))

    const formattedOwnerTypeStats = ownerTypeStats.map((stat) => ({
      ownerType: stat.ownerType,
      ownerTypeName: stat.ownerType === 'VILLAGE_COLLECTIVE' ? '村集体' : '镇集体',
      count: stat._count,
    }))

    return NextResponse.json({
      success: true,
      data: {
        totalCount,
        frozenCount,
        monthStockCount,
        monthOutCount,
        monthReturnCount,
        statusStats: formattedStatusStats,
        ownerTypeStats: formattedOwnerTypeStats,
        villageStats,
      },
    })
  } catch (error) {
    console.error('Get collective cert stats error:', error)
    return NextResponse.json({ error: '统计查询失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
