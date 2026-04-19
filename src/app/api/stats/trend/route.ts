/**
 * 趋势分析统计 API
 * GET /api/stats/trend - 获取趋势分析数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface DailyStat {
  date: string
  count: number
}

interface MonthlyStat {
  month: string
  count: number
}

// 获取日期范围内的日期数组
function getDateRange(startDate: Date, endDate: Date, unit: 'day' | 'week' | 'month'): Date[] {
  const dates: Date[] = []
  const current = new Date(startDate)

  while (current <= endDate) {
    dates.push(new Date(current))
    if (unit === 'day') {
      current.setDate(current.getDate() + 1)
    } else if (unit === 'week') {
      current.setDate(current.getDate() + 7)
    } else if (unit === 'month') {
      current.setMonth(current.getMonth() + 1)
    }
  }

  return dates
}

// 获取本周开始日期（周一）
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// 按天统计
async function getDailyStats(
  startDate: Date,
  endDate: Date,
  table: 'zjdBdc' | 'collectiveCert' | 'operationLog',
  where: Record<string, unknown> = {},
): Promise<DailyStat[]> {
  const stats = await (prisma[table] as any).groupBy({
    by: ['createdAt'],
    where: {
      ...where,
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: true,
  })

  return stats.map((s: { createdAt: Date; _count: number }) => ({
    date: s.createdAt.toISOString().split('T')[0],
    count: s._count,
  }))
}

// 按月统计
async function getMonthlyStats(
  year: number,
  table: 'zjdBdc' | 'collectiveCert' | 'operationLog',
  where: Record<string, unknown> = {},
): Promise<MonthlyStat[]> {
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)

  const stats = await (prisma[table] as any).groupBy({
    by: ['createdAt'],
    where: {
      ...where,
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: true,
  })

  // 按月汇总
  const monthlyData: Record<string, number> = {}
  for (let i = 0; i < 12; i++) {
    monthlyData[String(i + 1)] = 0
  }

  stats.forEach((s: { createdAt: Date; _count: number }) => {
    const month = s.createdAt.getMonth() + 1
    monthlyData[String(month)] += s._count
  })

  return Object.entries(monthlyData).map(([month, count]) => ({
    month: `${year}-${month.padStart(2, '0')}`,
    count,
  }))
}

// 按年统计
async function getYearlyStats(
  table: 'zjdBdc' | 'collectiveCert' | 'operationLog',
  where: Record<string, unknown> = {},
) {
  const stats = await (prisma[table] as any).groupBy({
    by: ['createdAt'],
    where: {
      ...where,
    },
    _count: true,
  })

  // 按年汇总
  const yearlyData: Record<string, number> = {}
  stats.forEach((s: any) => {
    const year = s.createdAt.getFullYear()
    yearlyData[String(year)] = (yearlyData[String(year)] || 0) + s._count
  })

  return Object.entries(yearlyData)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => ({ year, count }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'daily' // daily, weekly, monthly, yearly
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const townId = searchParams.get('townId')
    const villageId = searchParams.get('villageId')

    // 构建基础查询条件
    const baseWhere: Record<string, unknown> = {}
    if (townId) {
      baseWhere.village = { townId }
    }
    if (villageId) {
      baseWhere.villageId = villageId
    }

    // 宅基地 BDC 趋势
    const bdcWhere = { ...baseWhere }
    // 村集体证书趋势
    const certWhere = { ...baseWhere }

    let bdcStats: any[] = []
    let certStats: any[] = []
    let logStats: any[] = []

    if (type === 'daily') {
      // 最近 30 天按日统计
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      const bdcRaw = await getDailyStats(start, end, 'zjdBdc', bdcWhere)
      const certRaw = await getDailyStats(start, end, 'collectiveCert', certWhere)
      const logRaw = await getDailyStats(start, end, 'operationLog')

      // 填充缺失日期
      const dates = getDateRange(start, end, 'day')
      const dateMap = new Map(dates.map((d) => [d.toISOString().split('T')[0], 0]))

      bdcRaw.forEach((s: DailyStat) => dateMap.set(s.date, s.count))
      bdcStats = Array.from(dateMap.entries()).map(([date, count]) => ({ date, bdcCount: count }))

      const dateMap2 = new Map(dates.map((d) => [d.toISOString().split('T')[0], 0]))
      certRaw.forEach((s: DailyStat) => dateMap2.set(s.date, s.count))
      certStats = Array.from(dateMap2.entries()).map(([date, count]) => ({
        date,
        certCount: count,
      }))

      const dateMap3 = new Map(dates.map((d) => [d.toISOString().split('T')[0], 0]))
      logRaw.forEach((s: DailyStat) => dateMap3.set(s.date, s.count))
      logStats = Array.from(dateMap3.entries()).map(([date, count]) => ({ date, logCount: count }))
    } else if (type === 'weekly') {
      // 最近 12 周按周统计
      const end = endDate ? new Date(endDate) : new Date()
      const start = new Date(end.getTime() - 84 * 24 * 60 * 60 * 1000) // 12 周前

      const bdcRaw = await getDailyStats(start, end, 'zjdBdc', bdcWhere)
      const certRaw = await getDailyStats(start, end, 'collectiveCert', certWhere)
      const logRaw = await getDailyStats(start, end, 'operationLog')

      // 按周汇总
      const weekMap = new Map<string, { bdc: number; cert: number; log: number }>()
      for (let i = 0; i < 12; i++) {
        const weekStart = getWeekStart(new Date(end.getTime() - (11 - i) * 7 * 24 * 60 * 60 * 1000))
        const weekKey = weekStart.toISOString().split('T')[0]
        weekMap.set(weekKey, { bdc: 0, cert: 0, log: 0 })
      }

      bdcRaw.forEach((s: DailyStat) => {
        const weekStart = getWeekStart(new Date(s.date))
        const weekKey = weekStart.toISOString().split('T')[0]
        if (weekMap.has(weekKey)) {
          weekMap.get(weekKey)!.bdc += s.count
        }
      })

      certRaw.forEach((s: DailyStat) => {
        const weekStart = getWeekStart(new Date(s.date))
        const weekKey = weekStart.toISOString().split('T')[0]
        if (weekMap.has(weekKey)) {
          weekMap.get(weekKey)!.cert += s.count
        }
      })

      logRaw.forEach((s: DailyStat) => {
        const weekStart = getWeekStart(new Date(s.date))
        const weekKey = weekStart.toISOString().split('T')[0]
        if (weekMap.has(weekKey)) {
          weekMap.get(weekKey)!.log += s.count
        }
      })

      bdcStats = Array.from(weekMap.entries()).map(([week, data]) => ({ week, bdcCount: data.bdc }))
      certStats = Array.from(weekMap.entries()).map(([week, data]) => ({
        week,
        certCount: data.cert,
      }))
      logStats = Array.from(weekMap.entries()).map(([week, data]) => ({ week, logCount: data.log }))
    } else if (type === 'monthly') {
      // 本年度按月统计
      const year = new Date().getFullYear()
      bdcStats = await getMonthlyStats(year, 'zjdBdc', bdcWhere)
      certStats = await getMonthlyStats(year, 'collectiveCert', certWhere)
      logStats = await getMonthlyStats(year, 'operationLog')
    } else if (type === 'yearly') {
      // 按年统计（所有年份）
      bdcStats = await getYearlyStats('zjdBdc', bdcWhere)
      certStats = await getYearlyStats('collectiveCert', certWhere)
      logStats = await getYearlyStats('operationLog')
    }

    // 合并数据
    let mergedStats: any[] = []
    if (type === 'daily') {
      const dateSet = new Set([
        ...bdcStats.map((s) => s.date),
        ...certStats.map((s) => s.date),
        ...logStats.map((s) => s.date),
      ])
      mergedStats = Array.from(dateSet)
        .sort()
        .map((date) => ({
          date,
          bdcCount: bdcStats.find((s) => s.date === date)?.bdcCount || 0,
          certCount: certStats.find((s) => s.date === date)?.certCount || 0,
          logCount: logStats.find((s) => s.date === date)?.logCount || 0,
        }))
    } else if (type === 'weekly') {
      const weekSet = new Set([
        ...bdcStats.map((s) => s.week),
        ...certStats.map((s) => s.week),
        ...logStats.map((s) => s.week),
      ])
      mergedStats = Array.from(weekSet)
        .sort()
        .map((week) => ({
          week,
          bdcCount: bdcStats.find((s) => s.week === week)?.bdcCount || 0,
          certCount: certStats.find((s) => s.week === week)?.certCount || 0,
          logCount: logStats.find((s) => s.week === week)?.logCount || 0,
        }))
    } else if (type === 'monthly') {
      const monthSet = new Set([
        ...bdcStats.map((s) => s.month),
        ...certStats.map((s) => s.month),
        ...logStats.map((s) => s.month),
      ])
      mergedStats = Array.from(monthSet)
        .sort()
        .map((month) => ({
          month,
          bdcCount: bdcStats.find((s) => s.month === month)?.count || 0,
          certCount: certStats.find((s) => s.month === month)?.count || 0,
          logCount: logStats.find((s) => s.month === month)?.count || 0,
        }))
    } else if (type === 'yearly') {
      const yearSet = new Set([
        ...bdcStats.map((s) => s.year),
        ...certStats.map((s) => s.year),
        ...logStats.map((s) => s.year),
      ])
      mergedStats = Array.from(yearSet)
        .sort()
        .map((year) => ({
          year,
          bdcCount: bdcStats.find((s) => s.year === year)?.count || 0,
          certCount: certStats.find((s) => s.year === year)?.count || 0,
          logCount: logStats.find((s) => s.year === year)?.count || 0,
        }))
    }

    // 计算总计
    const totalBdc = mergedStats.reduce((sum, s) => sum + (s.bdcCount || 0), 0)
    const totalCert = mergedStats.reduce((sum, s) => sum + (s.certCount || 0), 0)
    const totalLog = mergedStats.reduce((sum, s) => sum + (s.logCount || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        type,
        stats: mergedStats,
        summary: {
          totalBdc,
          totalCert,
          totalLog,
        },
      },
    })
  } catch (error) {
    console.error('Get trend stats error:', error)
    return NextResponse.json({ error: '获取趋势统计失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
