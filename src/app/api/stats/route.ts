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

    // 构建基础查询条件
    const baseWhere: Record<string, unknown> = {}
    if (townId) {
      baseWhere.village = { townId }
    }

    // 1. 宅基地总数
    const totalBdc = await prisma.zjdBdc.count({ where: baseWhere })

    // 2. 宅基地按状态统计
    const bdcStatusStats = await prisma.zjdBdc.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    })

    const statusMap: Record<string, string> = {
      PENDING: '待审核',
      APPROVED: '已批准',
      ISSUED: '已发放',
      COMPLETED: '已完成',
      CANCELLED: '已注销',
    }

    // 3. 村集体证书总数
    const totalCert = await prisma.collectiveCert.count({ where: baseWhere })

    // 4. 村集体证书按状态统计
    const certStatusStats = await prisma.collectiveCert.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    })

    const certStatusMap: Record<string, string> = {
      IN_STOCK: '在库',
      OUT_STOCK: '已出库',
      RETURNED: '已归还',
      CANCELLED: '已注销',
      FROZEN: '已冻结',
      PENDING_APPROVE: '待审核',
    }

    // 5. 镇街统计
    const towns = await prisma.sysTown.findMany({
      include: {
        villages: {
          include: {
            bdcs: { select: { id: true, status: true } },
            collectiveCerts: { select: { id: true, status: true } },
          },
        },
      },
    })

    const townStats = towns.map((town) => {
      const bdcCount = town.villages.reduce((sum, v) => sum + v.bdcs.length, 0)
      const certCount = town.villages.reduce((sum, v) => sum + v.collectiveCerts.length, 0)
      return {
        townId: town.id,
        townName: town.name,
        bdcCount,
        certCount,
      }
    })

    // 6. 本月新增
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthBdc = await prisma.zjdBdc.count({
      where: { ...baseWhere, createdAt: { gte: monthStart } },
    })
    const thisMonthCert = await prisma.collectiveCert.count({
      where: { ...baseWhere, createdAt: { gte: monthStart } },
    })

    // 7. 待处理任务
    const pendingBdc = await prisma.zjdBdc.count({
      where: { ...baseWhere, status: 'PENDING' },
    })
    const pendingCertApprove = await prisma.collectiveCert.count({
      where: { ...baseWhere, status: 'PENDING_APPROVE' },
    })
    // 待领取：已发放但尚未领取完成的记录
    const pendingReceive = await prisma.zjdReceiveRecord.count({
      where: { status: 'ISSUED' },
    })
    const pendingObjection = await prisma.objection.count({
      where: { status: 'PENDING' },
    })

    // 8. 最近 7 天操作日志统计
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recentLogs = await prisma.operationLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalBdc,
          totalCert,
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
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: '获取统计失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const GET = withPermission(['stats:read'], ['ADMIN', 'STATS_VIEWER'])(getStatsHandler)
