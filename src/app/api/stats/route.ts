/**
 * 综合统计 API
 * GET /api/stats - 获取综合统计数据（仪表盘用）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'

// GET /api/stats - 获取综合统计数据（仪表盘用）
async function getStatsHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const townId = searchParams.get('townId')

    // 构建分模型查询条件
    const bdcWhere: Record<string, unknown> = {}
    const certWhere: Record<string, unknown> = {}
    const receiveWhere: Record<string, unknown> = {}
    const objectionWhere: Record<string, unknown> = {}

    if (townId) {
      bdcWhere.village = { townId }
      certWhere.village = { townId }
      receiveWhere.bdc = { village: { townId } }
      objectionWhere.receiveRecord = { bdc: { village: { townId } } }
    }

    const statusMap: Record<string, string> = {
      PENDING: '待审核',
      APPROVED: '已批准',
      ISSUED: '已发放',
      COMPLETED: '已完成',
      CANCELLED: '已注销',
    }

    const certStatusMap: Record<string, string> = {
      IN_STOCK: '在库',
      OUT_STOCK: '已出库',
      RETURNED: '已归还',
      CANCELLED: '已注销',
      FROZEN: '已冻结',
      PENDING_APPROVE: '待审核',
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const [
      totalUsers,
      totalBdc,
      totalCert,
      totalReceive,
      bdcStatusStats,
      certStatusStats,
      townBdcStats,
      townCertStats,
      townsData,
      thisMonthBdc,
      thisMonthCert,
      pendingBdc,
      pendingCertApprove,
      pendingReceive,
      pendingObjection,
      recentLogs,
    ] = await Promise.all([
      prisma.sysUser.count(),
      prisma.zjdBdc.count({ where: bdcWhere }),
      prisma.collectiveCert.count({ where: certWhere }),
      prisma.zjdReceiveRecord.count({ where: receiveWhere }),
      prisma.zjdBdc.groupBy({
        by: ['status'],
        where: bdcWhere,
        _count: true,
      }),
      prisma.collectiveCert.groupBy({
        by: ['status'],
        where: certWhere,
        _count: true,
      }),
      prisma.zjdBdc.groupBy({
        by: ['villageId'],
        where: bdcWhere,
        _count: { id: true },
      }),
      prisma.collectiveCert.groupBy({
        by: ['villageId'],
        where: certWhere,
        _count: { id: true },
      }),
      prisma.sysTown.findMany({
        include: {
          villages: { select: { id: true, name: true } },
        },
      }),
      prisma.zjdBdc.count({
        where: { ...bdcWhere, createdAt: { gte: monthStart } },
      }),
      prisma.collectiveCert.count({
        where: { ...certWhere, createdAt: { gte: monthStart } },
      }),
      prisma.zjdBdc.count({
        where: { ...bdcWhere, status: 'PENDING' },
      }),
      prisma.collectiveCert.count({
        where: { ...certWhere, status: 'PENDING_APPROVE' },
      }),
      prisma.zjdReceiveRecord.count({
        where: { ...receiveWhere, status: 'ISSUED' },
      }),
      prisma.objection.count({
        where: { ...objectionWhere, status: 'PENDING' },
      }),
      prisma.operationLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: true,
      }),
    ])

    // 构建村居到镇街的映射
    const villageToTown = new Map<string, { townId: string; townName: string; villageId: string }>()
    for (const town of townsData) {
      for (const village of town.villages) {
        villageToTown.set(village.id, {
          townId: town.id,
          townName: town.name,
          villageId: village.id,
        })
      }
    }

    // 聚合镇街统计
    const townCountMap = new Map<
      string,
      { townId: string; townName: string; bdcCount: number; certCount: number }
    >()
    for (const town of townsData) {
      townCountMap.set(town.id, { townId: town.id, townName: town.name, bdcCount: 0, certCount: 0 })
    }

    for (const stat of townBdcStats) {
      const townInfo = villageToTown.get(stat.villageId)
      if (townInfo) {
        const townStat = townCountMap.get(townInfo.townId)
        if (townStat) {
          townStat.bdcCount += stat._count.id
        }
      }
    }

    for (const stat of townCertStats) {
      const townInfo = villageToTown.get(stat.villageId)
      if (townInfo) {
        const townStat = townCountMap.get(townInfo.townId)
        if (townStat) {
          townStat.certCount += stat._count.id
        }
      }
    }

    const townStats = Array.from(townCountMap.values())

    const response = NextResponse.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalBdc,
          totalCert,
          totalReceive,
          thisMonthBdc,
          thisMonthCert,
        },
        bdcStatus: bdcStatusStats.map((s) => ({
          status: s.status,
          statusName: statusMap[s.status] || s.status,
          count: s._count,
        })),
        certStatus: certStatusStats.map((s) => ({
          status: s.status,
          statusName: certStatusMap[s.status] || s.status,
          count: s._count,
        })),
        townStats,
        pendingTasks: {
          pendingBdc,
          pendingCertApprove,
          pendingReceive,
          pendingObjection,
          total: pendingBdc + pendingCertApprove + pendingReceive + pendingObjection,
        },
        recentActivity: recentLogs.map((l) => ({
          action: l.action,
          count: l._count,
        })),
      },
    })
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=300')
    return response
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: '获取统计失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(['stats:read'], ['ADMIN', 'STATS_VIEWER'])(getStatsHandler)
