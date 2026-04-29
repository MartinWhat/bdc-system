/**
 * 宅基地状态管理 API
 * PUT /api/bdc/[id]/status - 更新宅基地状态
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/api/withPermission'
import { getUserFromRequest } from '@/lib/middleware/auth'
import { getDataPermissionFilter } from '@/lib/auth/data-permission'
import { z } from 'zod'

const statusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'CERTIFIED', 'CANCELLED']),
  reason: z.string().optional(),
})

/**
 * 检查用户是否有权访问指定宅基地记录
 */
async function canAccessBdc(
  request: NextRequest,
  bdcVillageId: string,
  bdcCreatedBy?: string,
): Promise<boolean> {
  const { userId } = getUserFromRequest(request)
  if (!userId) return false

  const filter = await getDataPermissionFilter(userId)

  switch (filter.scope) {
    case 'ALL':
      return true
    case 'TOWN':
      if (!filter.townIds || filter.townIds.length === 0) return false
      const townVillages = await prisma.sysVillage.findMany({
        where: { townId: { in: filter.townIds } },
        select: { id: true },
      })
      return townVillages.some((v) => v.id === bdcVillageId)
    case 'VILLAGE':
      if (!filter.villageIds || filter.villageIds.length === 0) return false
      return filter.villageIds.includes(bdcVillageId)
    case 'SELF':
      return bdcCreatedBy === userId
    default:
      return false
  }
}

async function updateBdcStatusHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = statusSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { status, reason } = validationResult.data

    const existingBdc = await prisma.zjdBdc.findUnique({
      where: { id },
    })

    if (!existingBdc) {
      return NextResponse.json(
        { error: '宅基地档案不存在', code: 'BDC_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 检查数据权限
    const canAccess = await canAccessBdc(request, existingBdc.villageId, existingBdc.createdBy)
    if (!canAccess) {
      return NextResponse.json(
        { error: '无权更新该宅基地状态', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    // 验证状态流转
    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['CERTIFIED', 'CANCELLED'],
      CERTIFIED: ['CANCELLED'],
      CANCELLED: [],
    }

    if (!validTransitions[existingBdc.status].includes(status)) {
      return NextResponse.json(
        {
          error: `不允许从 ${existingBdc.status} 流转到 ${status}`,
          code: 'INVALID_STATUS_TRANSITION',
        },
        { status: 400 },
      )
    }

    const updateData: Record<string, unknown> = { status }

    // 如果是发证状态，记录发证日期
    if (status === 'CERTIFIED') {
      updateData.certIssuedDate = new Date()
    }

    const bdc = await prisma.zjdBdc.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: bdc,
      message: `状态已更新为 ${status}`,
    })
  } catch (error) {
    console.error('Update BDC status error:', error)
    return NextResponse.json({ error: '更新状态失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export const PUT = withPermission(['bdc:update'], ['ADMIN', 'BDC_MANAGER'])(updateBdcStatusHandler)
