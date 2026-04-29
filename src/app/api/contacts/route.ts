/**
 * 通讯录 API
 * GET /api/contacts - 获取通讯录列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sm4Decrypt } from '@/lib/gm-crypto'
import { getActiveKey } from '@/lib/kms'
import { maskPhone } from '@/lib/utils/mask'
import { withPermission } from '@/lib/api/withPermission'

// GET - 获取通讯录列表
async function getContactsListHandler(request: NextRequest) {
  try {
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

    // 批量解密手机号并脱敏
    const phonesToDecrypt = users.filter((u) => u.phone).map((u) => u.phone as string)

    const phoneMap = new Map<string, string>()
    if (phonesToDecrypt.length > 0) {
      const sm4KeyRecord = await getActiveKey('SM4_DATA')
      const sm4Key = sm4KeyRecord.keyData
      for (const encrypted of phonesToDecrypt) {
        try {
          const [iv, ciphertext] = encrypted.split(':')
          phoneMap.set(encrypted, sm4Decrypt(ciphertext, sm4Key, iv))
        } catch {
          phoneMap.set(encrypted, '')
        }
      }
    }

    const decryptedUsers = users.map((user) => ({
      ...user,
      phone: user.phone ? maskPhone(phoneMap.get(user.phone) || '') : '',
      roles: user.roles.map((ur) => ur.role),
    }))

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
export const GET = withPermission(
  ['contact:read'],
  ['ADMIN', 'CONTACT_MANAGER'],
)(getContactsListHandler)
