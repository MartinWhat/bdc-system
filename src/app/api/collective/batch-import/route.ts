/**
 * 批量入库 API
 * POST /api/collective/batch-import - 批量导入证书
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { getCurrentUserId } from '@/lib/auth/middleware'
import { z } from 'zod'

const batchImportSchema = z.object({
  items: z
    .array(
      z.object({
        certNo: z.string().min(1),
        ownerName: z.string().min(1),
        ownerType: z.enum(['VILLAGE_COLLECTIVE', 'TOWN_COLLECTIVE']).optional(),
        villageId: z.string().min(1),
        idCard: z.string().length(18).optional(),
        phone: z
          .string()
          .regex(/^1[3-9]\d{9}$/)
          .optional(),
        address: z.string().min(1),
        area: z.number().positive(),
        landUseType: z.string().optional(),
        certIssueDate: z.string().optional(),
        certExpiryDate: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .min(1, '至少需要一条数据')
    .max(100, '最多支持 100 条数据'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = batchImportSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { items } = validationResult.data
    const operatorId = await getCurrentUserId(request)

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查所有村居是否存在
    const villageIds = items.map((item) => item.villageId)
    const villages = await prisma.sysVillage.findMany({
      where: { id: { in: villageIds } },
    })

    const invalidVillageIds = villageIds.filter((id) => !villages.some((v) => v.id === id))
    if (invalidVillageIds.length > 0) {
      return NextResponse.json(
        { error: `村居不存在: ${invalidVillageIds.join(', ')}`, code: 'VILLAGE_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 检查证书编号是否已存在
    const certNos = items.map((item) => item.certNo)
    const existingCerts = await prisma.collectiveCert.findMany({
      where: { certNo: { in: certNos } },
      select: { certNo: true },
    })

    const existingCertNos = existingCerts.map((c) => c.certNo)

    const successCount = 0
    const failedCount = 0
    const failedItems: { certNo: string; reason: string }[] = []

    // 批量创建证书
    const results = await Promise.allSettled(
      items.map(async (item) => {
        // 检查证书编号是否已存在
        if (existingCertNos.includes(item.certNo)) {
          throw new Error('证书编号已存在')
        }

        // 加密敏感字段
        let encryptedIdCard: string | undefined
        let idCardHash: string | undefined
        let encryptedPhone: string | undefined
        let phoneHash: string | undefined

        if (item.idCard) {
          const encrypted = await encryptSensitiveField(item.idCard)
          encryptedIdCard = encrypted.encrypted
          idCardHash = encrypted.hash
        }

        if (item.phone) {
          const encrypted = await encryptSensitiveField(item.phone)
          encryptedPhone = encrypted.encrypted
          phoneHash = encrypted.hash
        }

        // 创建证书
        const cert = await prisma.collectiveCert.create({
          data: {
            certNo: item.certNo,
            ownerName: item.ownerName,
            ownerType: item.ownerType || 'VILLAGE_COLLECTIVE',
            villageId: item.villageId,
            idCard: encryptedIdCard,
            idCardHash,
            phone: encryptedPhone,
            phoneHash,
            address: item.address,
            area: item.area,
            landUseType: item.landUseType,
            certIssueDate: item.certIssueDate ? new Date(item.certIssueDate) : undefined,
            certExpiryDate: item.certExpiryDate ? new Date(item.certExpiryDate) : undefined,
            remark: item.remark,
            status: 'PENDING_APPROVE',
            stockBy: operatorId,
            createdBy: operatorId,
          },
        })

        // 创建操作记录
        await prisma.certOperation.create({
          data: {
            certId: cert.id,
            operationType: 'STOCK_APPLY',
            operatorId,
            operatorName: '系统',
            description: '批量导入入库申请',
            metadata: JSON.stringify({
              certNo: item.certNo,
              ownerName: item.ownerName,
            }),
          },
        })

        return cert
      }),
    )

    // 统计结果
    let sCount = 0
    let fCount = 0
    const fItems: { certNo: string; reason: string }[] = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sCount++
      } else {
        fCount++
        fItems.push({
          certNo: items[index].certNo,
          reason: result.reason instanceof Error ? result.reason.message : '导入失败',
        })
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        successCount: sCount,
        failedCount: fCount,
        failedItems: fItems,
      },
      message: `批量导入完成: 成功 ${sCount}，失败 ${fCount}`,
    })
  } catch (error) {
    console.error('Batch import collective certs error:', error)
    return NextResponse.json({ error: '批量导入失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
