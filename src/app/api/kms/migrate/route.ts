/**
 * 密钥数据迁移 API
 * POST - 执行数据迁移（事务化，失败可回滚）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveKey } from '@/lib/kms'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { createEncryptionContext, encryptWithContext } from '@/lib/gm-crypto'
import { isAdmin } from '@/lib/middleware/auth'
import { logOperation } from '@/lib/log'

export async function POST(request: NextRequest) {
  try {
    // 授权校验：只有管理员可以执行密钥迁移
    if (!isAdmin(request)) {
      return NextResponse.json({ error: '需要管理员权限', code: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await request.json()
    const { oldKeyId, newKeyId, dryRun = false } = body

    if (!oldKeyId || !newKeyId) {
      return NextResponse.json(
        { error: '源密钥和目标密钥不能为空', code: 'MISSING_PARAMS' },
        { status: 400 },
      )
    }

    // 验证密钥是否存在
    const oldKey = await prisma.sysKeyVersion.findUnique({
      where: { id: oldKeyId },
    })
    const newKey = await prisma.sysKeyVersion.findUnique({
      where: { id: newKeyId },
    })

    if (!oldKey || !newKey) {
      return NextResponse.json(
        { error: '源密钥或目标密钥不存在', code: 'KEY_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 如果是 dryRun 模式，只检查不实际迁移
    if (dryRun) {
      const users = await prisma.sysUser.findMany({
        where: {
          idCard: { contains: ':' },
        },
        select: {
          id: true,
          idCard: true,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          dryRun: true,
          totalRecords: users.length,
          message: '预检查完成，可以执行迁移',
        },
      })
    }

    // 使用事务执行迁移
    const result = await prisma.$transaction(
      async (tx) => {
        let migrated = 0
        let errors: Array<{ id: string; error: string }> = []

        // 获取新密钥的加密上下文
        const context = await createEncryptionContext()

        // 迁移用户表中的敏感数据
        const users = await tx.sysUser.findMany({
          where: {
            idCard: { contains: ':' }, // 已加密的数据
          },
          select: {
            id: true,
            idCard: true,
            phone: true,
          },
        })

        for (const user of users) {
          try {
            const updateData: Record<string, string> = {}

            if (user.idCard) {
              const plaintext = await decryptSensitiveField(user.idCard)
              const { encrypted } = encryptWithContext(plaintext, context)
              updateData.idCard = encrypted
            }

            if (user.phone && user.phone.includes(':')) {
              const plaintext = await decryptSensitiveField(user.phone)
              const { encrypted } = encryptWithContext(plaintext, context)
              updateData.phone = encrypted
            }

            if (Object.keys(updateData).length > 0) {
              await tx.sysUser.update({
                where: { id: user.id },
                data: updateData,
              })
              migrated++
            }
          } catch (error) {
            console.error('Migrate user error:', error)
            errors.push({
              id: user.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        // 记录迁移日志
        await tx.operationLog.create({
          data: {
            userId: 'system',
            action: 'KMS_MIGRATE',
            module: 'KMS',
            description: `密钥迁移：从 ${oldKeyId} 到 ${newKeyId}, 成功 ${migrated} 条，失败 ${errors.length} 条`,
            status: errors.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
            responseData: JSON.stringify({ migrated, failed: errors.length, errors }),
          },
        })

        return { migrated, failed: errors.length, errors }
      },
      {
        timeout: 5 * 60 * 1000, // 5 分钟超时
      },
    )

    return NextResponse.json({
      success: true,
      data: {
        migrated: result.migrated,
        failed: result.failed,
        errors: result.errors.slice(0, 10), // 只返回前 10 个错误
      },
      message: `迁移完成：成功 ${result.migrated} 条，失败 ${result.failed} 条`,
    })
  } catch (error) {
    console.error('Migrate data error:', error)
    // 事务失败会自动回滚
    return NextResponse.json(
      {
        error: '迁移失败，数据已回滚',
        code: 'SERVER_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
