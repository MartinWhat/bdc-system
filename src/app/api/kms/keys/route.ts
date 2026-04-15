/**
 * 密钥管理 API
 * GET  - 获取密钥列表
 * POST - 创建新密钥
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllKeys, createKeyRecord, activateKey, type KeyType } from '@/lib/kms'

// GET - 获取密钥列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyType = searchParams.get('keyType') as KeyType | null
    const includeArchived = searchParams.get('includeArchived') === 'true'

    if (keyType) {
      // 获取指定类型的密钥
      const keys = await getAllKeys(keyType, includeArchived)
      return NextResponse.json({
        success: true,
        data: keys,
      })
    } else {
      // 获取所有类型的密钥
      const keyTypes: KeyType[] = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']
      const allKeys: any[] = []

      for (const kt of keyTypes) {
        const keys = await prisma.sysKeyVersion.findMany({
          where: {
            keyType: kt,
            deletedAt: null,
          },
          orderBy: { version: 'desc' },
        })
        allKeys.push(...keys)
      }

      return NextResponse.json({
        success: true,
        data: allKeys,
      })
    }
  } catch (error) {
    console.error('Get keys error:', error)
    return NextResponse.json({ error: '获取密钥列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 创建新密钥
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { keyType, expiresAt, createdBy } = body

    if (!keyType || !createdBy) {
      return NextResponse.json(
        { error: '密钥类型和创建人不能为空', code: 'MISSING_PARAMS' },
        { status: 400 },
      )
    }

    // 创建密钥
    const keyRecord = await createKeyRecord(
      keyType as KeyType,
      createdBy,
      expiresAt ? new Date(expiresAt) : undefined,
    )

    // 如果是该类型的第一个密钥，自动激活
    const existingKeys = await prisma.sysKeyVersion.findMany({
      where: { keyType },
    })

    if (existingKeys.length === 1) {
      await activateKey(keyRecord.id)
    }

    return NextResponse.json({
      success: true,
      data: keyRecord,
      message: '密钥创建成功',
    })
  } catch (error) {
    console.error('Create key error:', error)
    return NextResponse.json({ error: '创建密钥失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
