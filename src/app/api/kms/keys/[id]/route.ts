/**
 * 单个密钥操作 API
 * GET    - 获取密钥详情
 * PUT    - 更新密钥状态
 * DELETE - 删除密钥
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { activateKey, archiveKey, deleteKey, getActiveKey } from '@/lib/kms'

interface Params {
  params: Promise<{ id: string }>
}

// GET - 获取密钥详情
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const keyRecord = await prisma.sysKeyVersion.findUnique({
      where: { id },
    })

    if (!keyRecord) {
      return NextResponse.json({ error: '密钥记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: keyRecord,
    })
  } catch (error) {
    console.error('Get key detail error:', error)
    return NextResponse.json({ error: '获取密钥详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT - 更新密钥状态
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        { error: '操作类型不能为空', code: 'MISSING_ACTION' },
        { status: 400 },
      )
    }

    let message = ''

    switch (action) {
      case 'activate':
        // 激活密钥
        await activateKey(id)
        message = '密钥已激活'
        break

      case 'archive':
        // 归档密钥
        await archiveKey(id)
        message = '密钥已归档'
        break

      case 'delete':
        // 删除密钥
        await deleteKey(id)
        message = '密钥已删除'
        break

      default:
        return NextResponse.json(
          { error: '不支持的操作类型', code: 'INVALID_ACTION' },
          { status: 400 },
        )
    }

    return NextResponse.json({
      success: true,
      message,
    })
  } catch (error) {
    console.error('Update key error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}

// DELETE - 删除密钥
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // 检查是否是活跃密钥
    const keyRecord = await prisma.sysKeyVersion.findUnique({
      where: { id },
    })

    if (!keyRecord) {
      return NextResponse.json({ error: '密钥记录不存在', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (keyRecord.isActive) {
      return NextResponse.json(
        { error: '不能删除活跃密钥，请先归档', code: 'CANNOT_DELETE_ACTIVE' },
        { status: 400 },
      )
    }

    await deleteKey(id, true) // 强制删除

    return NextResponse.json({
      success: true,
      message: '密钥已删除',
    })
  } catch (error) {
    console.error('Delete key error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
