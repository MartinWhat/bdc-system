/**
 * 权限管理 API
 * GET /api/permissions - 获取所有权限列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const where: Record<string, unknown> = {}
    if (type) {
      where.type = type
    }

    const permissions = await prisma.sysPermission.findMany({
      where,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    })

    return NextResponse.json({
      success: true,
      data: permissions,
    })
  } catch (error) {
    console.error('Get permissions error:', error)
    return NextResponse.json({ error: '获取权限列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
