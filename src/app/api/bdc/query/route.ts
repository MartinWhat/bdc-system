/**
 * 宅基地查询 API
 * GET /api/bdc/query - 通过身份证号或手机号查询宅基地
 * 权限要求：需要 bdc:query 权限或管理员角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveKey } from '@/lib/kms'
import { sm3Hmac } from '@/lib/gm-crypto'
import { getUserRoles } from '@/lib/auth/user-service'
import { maskIdCard, maskPhone } from '@/lib/utils/mask'
import { z } from 'zod'

const querySchema = z.object({
  idCard: z.string().optional(),
  phone: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    // 权限检查：只有管理员或有 bdc:query 权限的用户可调用
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const roles = await getUserRoles(userId)
    const hasPermission = roles.includes('ADMIN') || roles.includes('BDC_MANAGER')

    if (!hasPermission) {
      return NextResponse.json({ error: '权限不足', code: 'FORBIDDEN' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const idCard = searchParams.get('idCard')
    const phone = searchParams.get('phone')

    if (!idCard && !phone) {
      return NextResponse.json(
        { error: '请提供身份证号或手机号', code: 'MISSING_QUERY_PARAM' },
        { status: 400 },
      )
    }

    const where: Record<string, unknown> = {}

    // 获取主密钥用于生成哈希
    const masterKeyRecord = await getActiveKey('MASTER_KEY')

    // 通过身份证号查询
    if (idCard) {
      const idCardHash = sm3Hmac(idCard, masterKeyRecord.keyValue)
      where.idCardHash = idCardHash
    }

    // 通过手机号查询
    if (phone) {
      const phoneHash = sm3Hmac(phone, masterKeyRecord.keyValue)
      where.phoneHash = phoneHash
    }

    const bdcs = await prisma.zjdBdc.findMany({
      where,
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // 脱敏处理
    const sanitizedBdcs = bdcs.map((bdc) => ({
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
