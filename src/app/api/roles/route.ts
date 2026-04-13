/**
 * 角色管理 API
 * GET    /api/roles - 获取角色列表
 * POST   /api/roles - 创建角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createRoleSchema = z.object({
  name: z.string().min(1, '角色名称不能为空'),
  code: z.string().min(1, '角色代码不能为空'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
})

// GET - 获取角色列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyword = searchParams.get('keyword') || ''

    const where: Record<string, unknown> = {}
    if (keyword) {
      where.OR = [{ name: { contains: keyword } }, { code: { contains: keyword } }]
    }

    const roles = await prisma.sysRole.findMany({
      where,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: roles,
    })
  } catch (error) {
    console.error('Get roles error:', error)
    return NextResponse.json({ error: '获取角色列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建角色
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = createRoleSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { name, code, description, permissionIds } = validationResult.data

    // 检查角色代码是否已存在
    const existingRole = await prisma.sysRole.findUnique({
      where: { code },
    })

    if (existingRole) {
      return NextResponse.json(
        { error: '角色代码已存在', code: 'ROLE_CODE_EXISTS' },
        { status: 409 },
      )
    }

    // 创建角色
    const role = await prisma.sysRole.create({
      data: {
        name,
        code,
        description: description || '',
        status: 'ACTIVE',
      },
    })

    // 分配权限
    if (permissionIds && permissionIds.length > 0) {
      await Promise.all(
        permissionIds.map((permissionId) =>
          prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId,
            },
          }),
        ),
      )
    }

    return NextResponse.json({
      success: true,
      data: role,
    })
  } catch (error: unknown) {
    console.error('Create role error:', error)
    return NextResponse.json({ error: '创建角色失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
