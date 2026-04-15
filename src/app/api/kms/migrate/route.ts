/**
 * 密钥数据迁移 API
 * POST - 执行数据迁移
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveKey } from '@/lib/kms'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { createEncryptionContext, encryptWithContext } from '@/lib/gm-crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oldKeyId, newKeyId } = body

    if (!oldKeyId || !newKeyId) {
      return NextResponse.json(
        { error: '源密钥和目标密钥不能为空', code: 'MISSING_PARAMS' },
        { status: 400 },
      )
    }

    // 简化的迁移逻辑（实际生产环境应该迁移所有表）
    // 这里只演示迁移流程
    let migrated = 0
    let failed = 0

    // 获取新密钥的加密上下文
    const context = await createEncryptionContext()

    // 示例：迁移用户表中的敏感数据
    const users = await prisma.sysUser.findMany({
      where: {
        idCard: { contains: ':' }, // 已加密的数据
      },
    })

    for (const user of users) {
      try {
        if (user.idCard) {
          // 解密
          const plaintext = await decryptSensitiveField(user.idCard)
          // 重新加密
          const { encrypted } = encryptWithContext(plaintext, context)
          // 更新
          await prisma.sysUser.update({
            where: { id: user.id },
            data: { idCard: encrypted },
          })
          migrated++
        }
      } catch (error) {
        console.error('Migrate user error:', error)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      data: { migrated, failed },
      message: `迁移完成：成功 ${migrated} 条，失败 ${failed} 条`,
    })
  } catch (error) {
    console.error('Migrate data error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '迁移失败', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
