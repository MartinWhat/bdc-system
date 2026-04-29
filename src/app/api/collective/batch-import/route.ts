/**
 * 批量入库 API
 * POST /api/collective/batch-import - 批量导入证书
 * 性能优化：一次性获取密钥，批量加密
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createEncryptionContext, encryptWithContext } from '@/lib/gm-crypto'
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
    const operatorId = request.headers.get('x-user-id')

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

    const existingCertNos = new Set(existingCerts.map((c) => c.certNo))

    // 性能优化：一次性创建加密上下文，避免重复获取密钥
    const encryptionContext = await createEncryptionContext()

    // 预处理所有需要加密的数据
    type ProcessedItem = {
      certNo: string
      ownerName: string
      ownerType?: 'VILLAGE_COLLECTIVE' | 'TOWN_COLLECTIVE'
      villageId: string
      address: string
      area: number
      landUseType?: string
      certIssueDate?: string
      certExpiryDate?: string
      remark?: string
      encryptedIdCard?: { encrypted: string; hash: string } | null
      encryptedPhone?: { encrypted: string; hash: string } | null
      error?: string | null
    }

    const processedItems: ProcessedItem[] = items.map((item) => {
      if (existingCertNos.has(item.certNo)) {
        return { ...item, error: '证书编号已存在' }
      }

      const encryptedIdCard = item.idCard
        ? encryptWithContext(item.idCard, encryptionContext)
        : null
      const encryptedPhone = item.phone ? encryptWithContext(item.phone, encryptionContext) : null

      return {
        ...item,
        encryptedIdCard,
        encryptedPhone,
        error: null,
      }
    })

    // 使用事务批量创建
    const fItems: { certNo: string; reason: string }[] = []

    const results = await prisma.$transaction(async (tx) => {
      const createdCerts = []

      for (const processedItem of processedItems) {
        if (processedItem.error) {
          fItems.push({
            certNo: processedItem.certNo,
            reason: processedItem.error,
          })
          continue
        }

        try {
          const cert = await tx.collectiveCert.create({
            data: {
              certNo: processedItem.certNo,
              ownerName: processedItem.ownerName,
              ownerType: processedItem.ownerType || 'VILLAGE_COLLECTIVE',
              villageId: processedItem.villageId,
              idCard: processedItem.encryptedIdCard?.encrypted,
              idCardHash: processedItem.encryptedIdCard?.hash,
              phone: processedItem.encryptedPhone?.encrypted,
              phoneHash: processedItem.encryptedPhone?.hash,
              address: processedItem.address,
              area: processedItem.area,
              landUseType: processedItem.landUseType,
              certIssueDate: processedItem.certIssueDate
                ? new Date(processedItem.certIssueDate)
                : undefined,
              certExpiryDate: processedItem.certExpiryDate
                ? new Date(processedItem.certExpiryDate)
                : undefined,
              remark: processedItem.remark,
              status: 'PENDING_APPROVE',
              stockBy: operatorId,
              createdBy: operatorId,
            },
          })

          // 创建操作记录
          await tx.certOperation.create({
            data: {
              certId: cert.id,
              operationType: 'STOCK_APPLY',
              operatorId,
              operatorName: '系统',
              description: '批量导入入库申请',
              metadata: JSON.stringify({
                certNo: processedItem.certNo,
                ownerName: processedItem.ownerName,
              }),
            },
          })

          createdCerts.push(cert)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '创建失败'
          fItems.push({
            certNo: processedItem.certNo,
            reason: errorMsg,
          })
        }
      }

      return createdCerts
    })

    const sCount = results.length
    const fCount = fItems.length

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
