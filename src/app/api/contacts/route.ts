/**
 * 通讯录 API
 * GET /api/contacts - 获取通讯录列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { getCurrentUser } from '@/lib/auth/middleware'

// GET - 获取通讯录列表
export async function GET(request: NextRequest) {
  try {
    // 验证用户认证
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const keyword = searchParams.get('keyword') || ''
    const role = searchParams.get('role') || ''
    const townId = searchParams.get('townId') || ''
    const villageId = searchParams.get('villageId') || ''

    const where: Record<string, unknown> = {
      status: 'ACTIVE', // 只显示活跃用户
    }

    // 搜索条件
    if (keyword) {
      where.OR = [{ realName: { contains: keyword } }, { email: { contains: keyword } }]
    }

    // 角色筛选
    if (role) {
      where.roles = {
        some: {
          role: {
            code: role,
          },
        },
      }
    }

    // 村居筛选
    if (villageId) {
      where.villageId = villageId
    } else if (townId) {
      // 镇街筛选：查询该镇街下所有村居的用户
      const villages = await prisma.sysVillage.findMany({
        where: { townId },
        select: { id: true },
      })
      if (villages.length > 0) {
        where.villageId = { in: villages.map((v) => v.id) }
      } else {
        // 该镇街下没有村居，返回空结果
        return NextResponse.json({
          success: true,
          data: { list: [], total: 0 },
        })
      }
    }

    const [total, users] = await Promise.all([
      prisma.sysUser.count({ where }),
      prisma.sysUser.findMany({
        where,
        select: {
          id: true,
          username: true,
          realName: true,
          email: true,
          phone: true,
          avatar: true,
          status: true,
          createdAt: true,
          village: {
            select: {
              id: true,
              name: true,
              town: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          roles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
        orderBy: { realName: 'asc' },
      }),
    ])

    // 解密敏感信息
    const decryptedUsers = await Promise.all(
      users.map(async (user) => ({
        ...user,
        phone: user.phone ? await decryptSensitiveField(user.phone) : '',
        roles: user.roles.map((ur) => ur.role),
      })),
    )

    return NextResponse.json({
      success: true,
      data: {
        list: decryptedUsers,
        total,
      },
    })
  } catch (error) {
    console.error('Get contacts error:', error)
    return NextResponse.json({ error: '获取通讯录失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
