/**
 * 用户管理 API
 * GET    /api/users - 获取用户列表
 * POST   /api/users - 创建用户
 * GET    /api/users/[id] - 获取用户详情
 * PUT    /api/users/[id] - 更新用户
 * DELETE /api/users/[id] - 删除用户
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { z } from 'zod'

// 创建用户验证
const createUserSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(6, '密码至少6位'),
  realName: z.string().min(1, '真实姓名不能为空'),
  idCard: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  roleIds: z.array(z.string()).optional(),
})

// 更新用户验证
const updateUserSchema = z.object({
  realName: z.string().optional(),
  idCard: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  twoFactorEnabled: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
})

// GET - 获取用户列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const keyword = searchParams.get('keyword') || ''
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}

    if (keyword) {
      where.OR = [{ username: { contains: keyword } }, { realName: { contains: keyword } }]
    }

    if (status) {
      where.status = status
    }

    const [total, users] = await Promise.all([
      prisma.sysUser.count({ where }),
      prisma.sysUser.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          realName: true,
          email: true,
          status: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
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
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        list: users,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json({ error: '获取用户列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createUserSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { username, password, realName, idCard, phone, email, roleIds } = validationResult.data

    // 检查用户名是否已存在
    const existingUser = await prisma.sysUser.findUnique({
      where: { username },
    })

    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在', code: 'USERNAME_EXISTS' }, { status: 409 })
    }

    // 密码加密
    const { passwordHash, salt } = hashUserPassword(password)

    // 构建创建数据
    const createData = {
      username,
      passwordHash,
      salt,
      realName,
      email: email || null,
      status: 'ACTIVE',
      createdBy: request.headers.get('x-user-id') || 'system',
      idCard: null as string | null,
      idCardHash: null as string | null,
      phone: null as string | null,
      phoneHash: null as string | null,
    }

    // 加密敏感字段
    if (idCard) {
      const result = await encryptSensitiveField(idCard)
      createData.idCard = result.encrypted
      createData.idCardHash = result.hash
    }

    if (phone) {
      const result = await encryptSensitiveField(phone)
      createData.phone = result.encrypted
      createData.phoneHash = result.hash
    }

    // 创建用户
    const user = await prisma.sysUser.create({
      data: createData,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    // 分配角色
    if (roleIds && roleIds.length > 0) {
      await Promise.all(
        roleIds.map((roleId) =>
          prisma.userRole.create({
            data: {
              userId: user.id,
              roleId,
            },
          }),
        ),
      )
    }

    return NextResponse.json({
      success: true,
      data: user,
    })
  } catch (error: any) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: '创建用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
