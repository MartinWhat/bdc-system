/**
 * 角色详情/更新/删除 API
 * GET    /api/roles/[id] - 获取角色详情
 * PUT    /api/roles/[id] - 更新角色
 * DELETE /api/roles/[id] - 删除角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateRoleSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  permissionIds: z.array(z.string()).optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const role = await prisma.sysRole.findUnique({
      where: { id },
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
    })

    if (!role) {
      return NextResponse.json({ error: '角色不存在', code: 'ROLE_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: role,
    })
  } catch (error) {
    console.error('Get role error:', error)
    return NextResponse.json({ error: '获取角色详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const validationResult = updateRoleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { name, description, status, permissionIds } = validationResult.data

    const existingRole = await prisma.sysRole.findUnique({
      where: { id },
    })

    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在', code: 'ROLE_NOT_FOUND' }, { status: 404 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (status !== undefined) updateData.status = status

    const role = await prisma.sysRole.update({
      where: { id },
      data: updateData,
    })

    // 更新权限关联
    if (permissionIds !== undefined) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: id },
      })

      if (permissionIds.length > 0) {
        await Promise.all(
          permissionIds.map((permissionId) =>
            prisma.rolePermission.create({
              data: {
                roleId: id,
                permissionId,
              },
            }),
          ),
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: role,
    })
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ error: '更新角色失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existingRole = await prisma.sysRole.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    })

    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在', code: 'ROLE_NOT_FOUND' }, { status: 404 })
    }

    if (existingRole._count.users > 0) {
      return NextResponse.json(
        { error: '该角色下还有用户，无法删除', code: 'ROLE_HAS_USERS' },
        { status: 409 },
      )
    }

    await prisma.sysRole.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '角色已删除',
    })
  } catch (error) {
    console.error('Delete role error:', error)
    return NextResponse.json({ error: '删除角色失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
