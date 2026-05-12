/**
 * 用户彻底删除 API
 * DELETE /api/users/[id]/purge - 彻底删除用户及其关联数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest, isAdmin } from '@/lib/middleware/auth'
import { logOperation } from '@/lib/log'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    if (!isAdmin(request)) {
      return NextResponse.json({ error: '需要管理员权限', code: 'FORBIDDEN' }, { status: 403 })
    }

    const existingUser = await prisma.sysUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        realName: true,
      },
    })

    if (!existingUser) {
      return NextResponse.json({ error: '用户不存在', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const { userId: currentUserId } = getUserFromRequest(request)
    if (id === currentUserId) {
      return NextResponse.json(
        { error: '不能彻底删除自己的账号', code: 'CANNOT_DELETE_SELF' },
        { status: 403 },
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.notificationRead.deleteMany({
        where: { userId: id },
      })

      await tx.notification.deleteMany({
        where: { authorId: id },
      })

      await tx.operationLog.deleteMany({
        where: { userId: id },
      })

      await tx.sysUser.delete({
        where: { id },
      })
    })

    await logOperation({
      userId: currentUserId || 'unknown',
      action: 'DELETE',
      module: 'USER',
      description: `彻底删除用户 ${existingUser.username} (${existingUser.realName})`,
      status: 'SUCCESS',
    })

    return NextResponse.json({
      success: true,
      message: '用户已彻底删除',
    })
  } catch (error) {
    console.error('Purge user error:', error)
    return NextResponse.json({ error: '彻底删除用户失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
