/**
 * 操作日志 API
 * GET /api/logs - 获取操作日志列表
 * GET /api/logs/stats - 获取日志统计
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryOperationLogs, getOperationLogStats } from '@/lib/log'

// GET - 获取操作日志列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const userId = searchParams.get('userId') || undefined
    const module = searchParams.get('module') || undefined
    const action = searchParams.get('action') || undefined
    const status = searchParams.get('status') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const result = await queryOperationLogs({
      page,
      pageSize,
      userId,
      module,
      action,
      status,
      startDate,
      endDate,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Get logs error:', error)
    return NextResponse.json({ error: '获取日志列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
