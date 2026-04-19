/**
 * 通讯录导出 API
 * GET /api/contacts/export - 导出通讯录为 CSV
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { getCurrentUser } from '@/lib/auth/middleware'

// GET - 导出通讯录
export async function GET(request: NextRequest) {
  try {
    // 验证用户认证
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const users = await prisma.sysUser.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        roles: {
          include: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { realName: 'asc' },
    })

    // 解密敏感信息并转换为 CSV
    const csvRows = ['姓名，用户名，角色，手机号，邮箱，状态，注册时间']

    const decryptedUsers = await Promise.all(
      users.map(async (user) => ({
        ...user,
        phone: user.phone ? await decryptSensitiveField(user.phone) : '',
      })),
    )

    for (const user of decryptedUsers) {
      const roles = user.roles.map((ur) => ur.role.name).join('/')
      const phone = user.phone || ''
      const row = [
        user.realName,
        user.username,
        roles,
        phone ? `"${phone}"` : '',
        user.email || '',
        user.status === 'ACTIVE' ? '正常' : '禁用',
        new Date(user.createdAt).toLocaleString('zh-CN'),
      ]
      csvRows.push(row.join(','))
    }

    const csvContent = csvRows.join('\n')
    const bytes = new TextEncoder().encode(csvContent)
    const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8;' })

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename=contacts.csv',
      },
    })
  } catch (error) {
    console.error('Export contacts error:', error)
    return NextResponse.json({ error: '导出失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
