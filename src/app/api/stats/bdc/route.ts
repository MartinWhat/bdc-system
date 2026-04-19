/**
 * 宅基地统计 API
 * GET /api/stats/bdc - 获取宅基地统计数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 状态映射
const statusMap: Record<string, string> = {
  PENDING: '待审核',
  APPROVED: '已批准',
  ISSUED: '已发放',
  COMPLETED: '已完成',
  CANCELLED: '已注销',
}

// 土地用途类型映射
const landUseTypeMap: Record<string, string> = {
  RESIDENTIAL: '宅基地',
  AGRICULTURAL: '农业用地',
  COMMERCIAL: '商业用地',
  INDUSTRIAL: '工业用地',
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const townId = searchParams.get('townId')
    const villageId = searchParams.get('villageId')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // 构建基础查询条件
    const baseWhere: Record<string, unknown> = {}
    if (townId) {
      baseWhere.village = { townId }
    }
    if (villageId) {
      baseWhere.villageId = villageId
    }
    if (status) {
      baseWhere.status = status
    }
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      baseWhere.createdAt = dateFilter
    }

    // 1. 按状态统计
    const statusStats = await prisma.zjdBdc.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    })

    // 2. 按镇街统计
    const townStats = await prisma.zjdBdc.groupBy({
      by: ['villageId'],
      where: baseWhere,
      _count: true,
    })

    // 获取镇街信息
    const villageIds = townStats.map((s) => s.villageId)
    const villages = await prisma.sysVillage.findMany({
      where: { id: { in: villageIds } },
      include: { town: { select: { id: true, name: true } } },
    })

    const formattedTownStats = townStats.map((stat) => {
      const village = villages.find((v) => v.id === stat.villageId)
      return {
        villageId: stat.villageId,
        villageName: village?.name || '未知',
        townId: village?.town?.id || '',
        townName: village?.town?.name || '未知',
        count: stat._count,
      }
    })

    // 按镇街汇总
    const townSummary = formattedTownStats.reduce(
      (acc, stat) => {
        if (!acc[stat.townId]) {
          acc[stat.townId] = { townId: stat.townId, townName: stat.townName, count: 0 }
        }
        acc[stat.townId].count += stat.count
        return acc
      },
      {} as Record<string, { townId: string; townName: string; count: number }>,
    )

    // 3. 按土地用途类型统计
    const landUseTypeStats = await prisma.zjdBdc.groupBy({
      by: ['landUseType'],
      where: baseWhere,
      _count: true,
    })

    // 4. 总数统计
    const totalCount = await prisma.zjdBdc.count({ where: baseWhere })

    // 按状态统计详细信息
    const statusStatsDetailed = await prisma.zjdBdc.groupBy({
      by: ['status', 'landUseType'],
      where: baseWhere,
      _count: true,
    })

    // 5. 本月新增统计
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthCount = await prisma.zjdBdc.count({
      where: { ...baseWhere, createdAt: { gte: monthStart } },
    })

    // 6. 本月发放统计
    const thisMonthIssued = await prisma.zjdBdc.count({
      where: {
        ...baseWhere,
        status: 'ISSUED',
        certIssuedDate: { gte: monthStart },
      },
    })

    // 格式化状态统计
    const formattedStatusStats = statusStats.map((stat) => ({
      status: stat.status,
      statusName: statusMap[stat.status] || stat.status,
      count: stat._count,
    }))

    // 格式化土地用途统计
    const formattedLandUseStats = landUseTypeStats.map((stat) => ({
      landUseType: stat.landUseType,
      landUseTypeName: landUseTypeMap[stat.landUseType] || stat.landUseType,
      count: stat._count,
    }))

    return NextResponse.json({
      success: true,
      data: {
        totalCount,
        thisMonthCount,
        thisMonthIssued,
        statusStats: formattedStatusStats,
        townStats: Object.values(townSummary),
        villageStats: formattedTownStats,
        landUseTypeStats: formattedLandUseStats,
        statusLandUseStats: statusStatsDetailed.map((s) => ({
          status: statusMap[s.status] || s.status,
          landUseType: landUseTypeMap[s.landUseType] || s.landUseType,
          count: s._count,
        })),
      },
    })
  } catch (error) {
    console.error('Get BDC stats error:', error)
    return NextResponse.json({ error: '获取统计失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
