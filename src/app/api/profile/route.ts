/**
 * 个人信息 API
 * GET    /api/profile - 获取当前用户信息
 * PUT    /api/profile - 更新当前用户信息
 * PATCH  /api/profile/password - 修改密码
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { getCurrentUser } from '@/lib/auth/middleware'
import { z } from 'zod'

// 更新用户信息验证
const updateProfileSchema = z.object({
  realName: z.string().min(1, '真实姓名不能为空').optional(),
  email: z.string().email().optional().or(z.literal('')).optional(),
  phone: z.string().optional(),
})

// 修改密码验证
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入原密码'),
  newPassword: z.string().min(6, '新密码至少 6 位'),
})

// GET - 获取当前用户信息
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const userInfo = await prisma.sysUser.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
        avatar: true,
        status: true,
        twoFactorEnabled: true,
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
    })

    if (!userInfo) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        ...userInfo,
        roles: userInfo.roles.map((ur) => ur.role),
      },
    })
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json({ error: '获取个人信息失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT - 更新当前用户信息
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = updateProfileSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { realName, email, phone } = validationResult.data

    const updateData: Record<string, string> = {}

    if (realName) updateData.realName = realName
    if (email !== undefined) updateData.email = email || ''

    // 加密手机号
    if (phone) {
      const phoneResult = await encryptSensitiveField(phone)
      updateData.phone = phoneResult.encrypted
    }

    const updatedUser = await prisma.sysUser.update({
      where: { id: user.userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        phone: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: '个人信息已更新',
    })
  } catch (error: unknown) {
    console.error('Update profile error:', error)
    return NextResponse.json({ error: '更新个人信息失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PATCH - 修改密码
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action !== 'password') {
      return NextResponse.json({ error: '无效的请求', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    const body = await request.json()
    const validationResult = changePasswordSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { oldPassword, newPassword } = validationResult.data

    // 获取当前用户（含密码哈希）
    const currentUser = await prisma.sysUser.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        passwordHash: true,
        salt: true,
      },
    })

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    // 验证原密码
    const { validateUserPassword } = await import('@/lib/auth')
    const isPasswordValid = validateUserPassword(
      oldPassword,
      currentUser.passwordHash,
      currentUser.salt,
    )

    if (!isPasswordValid) {
      return NextResponse.json({ error: '原密码错误', code: 'INVALID_PASSWORD' }, { status: 400 })
    }

    // 加密新密码（bcrypt 异步）
    const { passwordHash: newHash, salt: newSalt } = await hashUserPassword(newPassword)

    // 更新密码
    await prisma.sysUser.update({
      where: { id: user.userId },
      data: {
        passwordHash: newHash,
        salt: newSalt,
      },
    })

    return NextResponse.json({
      success: true,
      message: '密码已修改',
    })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: '修改密码失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
