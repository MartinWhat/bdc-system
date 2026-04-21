/**
 * 附件详情/删除 API
 * GET    /api/attachments/[id] - 获取附件详情
 * DELETE /api/attachments/[id] - 删除附件
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { join } from 'path'

// GET - 获取附件详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    })

    if (!attachment) {
      return NextResponse.json({ error: '附件不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: attachment,
    })
  } catch (error) {
    console.error('Get attachment error:', error)
    return NextResponse.json({ error: '获取附件详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// DELETE - 删除附件
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const authorId = request.headers.get('x-user-id')
    if (!authorId) {
      return NextResponse.json({ error: '未登录', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // 检查附件是否存在
    const attachment = await prisma.attachment.findUnique({
      where: { id },
    })

    if (!attachment) {
      return NextResponse.json({ error: '附件不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    // 删除文件
    const filePath = join(process.cwd(), attachment.url)
    try {
      await unlink(filePath)
    } catch (error) {
      console.error('Delete file error:', error)
      // 文件不存在也继续删除数据库记录
    }

    // 删除数据库记录
    await prisma.attachment.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '附件已删除',
    })
  } catch (error) {
    console.error('Delete attachment error:', error)
    return NextResponse.json({ error: '删除附件失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
