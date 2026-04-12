/**
 * 操作日志统计 API
 * GET /api/logs/stats - 获取日志统计
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOperationLogStats } from '@/lib/log'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')

    const stats = await getOperationLogStats(days)

    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('Get log stats error:', error)
    return NextResponse.json({ error: '获取日志统计失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
