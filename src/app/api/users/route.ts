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
import { encryptSensitiveField, decryptSensitiveField } from '@/lib/gm-crypto'
import { logOperation } from '@/lib/log'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

// 创建用户验证
const createUserSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(6, '密码至少6位'),
  realName: z.string().min(1, '真实姓名不能为空'),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/, '请输入正确的手机号'),
  fixedPhone: z
    .string()
    .trim()
    .regex(/^[0-9()+\-\s]{5,20}$/, '请输入正确的固定电话')
    .optional()
    .or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  roleIds: z.array(z.string()).optional(),
})

// GET - 获取用户列表
async function getUsersHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '10'), 100)
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
          fixedPhone: true,
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

    const list = await Promise.all(
      users.map(async (user) => ({
        ...user,
        fixedPhone: user.fixedPhone ? await decryptSensitiveField(user.fixedPhone) : undefined,
      })),
    )

    return NextResponse.json({
      success: true,
      data: {
        list,
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
export const GET = withPermission(['user:read'], ['ADMIN'])(getUsersHandler)

// POST - 创建用户
async function createUserHandler(request: NextRequest) {
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

    const { username, password, realName, phone, fixedPhone, email, roleIds } =
      validationResult.data

    // 检查用户名是否已存在
    const existingUser = await prisma.sysUser.findUnique({
      where: { username },
    })

    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在', code: 'USERNAME_EXISTS' }, { status: 409 })
    }

    // 构建创建数据
    const createData = {
      username,
      displayUsername: realName,
      passwordHash: await hashUserPassword(password),
      realName,
      email: email || `${username}@system.local`,
      status: 'ACTIVE',
      createdBy: request.headers.get('x-user-id') || 'system',
      phone: null as string | null,
      fixedPhone: null as string | null,
    }

    // 加密敏感字段
    const phoneResult = await encryptSensitiveField(phone)
    createData.phone = phoneResult.encrypted

    if (fixedPhone) {
      const result = await encryptSensitiveField(fixedPhone)
      createData.fixedPhone = result.encrypted
    }

    // 创建用户并同步 Better Auth credential account
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.sysUser.create({
        data: createData,
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      })

      await tx.authAccount.upsert({
        where: {
          providerId_accountId: {
            providerId: 'credential',
            accountId: createdUser.id,
          },
        },
        create: {
          userId: createdUser.id,
          accountId: createdUser.id,
          providerId: 'credential',
          password: createData.passwordHash,
        },
        update: {
          password: createData.passwordHash,
        },
      })

      // 分配角色
      if (roleIds && roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId: createdUser.id,
            roleId,
          })),
        })
      }

      return createdUser
    })

    // 记录日志
    await logOperation({
      userId: user.id,
      action: 'CREATE',
      module: 'USER',
      description: `创建用户 ${user.username}`,
      status: 'SUCCESS',
    })

    return NextResponse.json({
      success: true,
      data: user,
    })
  } catch (error: unknown) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: '创建用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(['user:create'], ['ADMIN'])(createUserHandler)
