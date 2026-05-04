/**
 * 批量入库 API
 * POST /api/collective/batch-import - 批量导入证书
 *
 * 支持两种导入方式：
 * 1. JSON 数据：{ items: [...] }
 * 2. Excel 文件：multipart/form-data，文件字段名 "file"
 *
 * 性能优化：一次性获取密钥，批量加密
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createEncryptionContext, encryptWithContext } from '@/lib/gm-crypto'
import { parseExcelBuffer } from '@/lib/excel-parser'
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

/**
 * 解析请求数据（支持 JSON 和 Excel 文件）
 */
async function parseRequestData(
  request: NextRequest,
): Promise<
  | { success: true; items: z.infer<typeof batchImportSchema>['items'] }
  | { success: false; error: string; details?: string }
> {
  const contentType = request.headers.get('content-type') || ''

  // JSON 请求
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json()
      const validationResult = batchImportSchema.safeParse(body)

      if (!validationResult.success) {
        return {
          success: false,
          error: '请求参数错误',
          details: validationResult.error.message,
        }
      }

      return { success: true, items: validationResult.data.items }
    } catch {
      return { success: false, error: 'JSON 解析失败' }
    }
  }

  // Excel 文件上传（multipart/form-data）
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData()
      const file = formData.get('file')

      if (!file || !(file instanceof File)) {
        return { success: false, error: '未找到上传的文件' }
      }

      // 检查文件类型
      const filename = file.name.toLowerCase()
      if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
        return { success: false, error: '仅支持 .xlsx 或 .xls 格式的 Excel 文件' }
      }

      // 解析 Excel
      const buffer = await file.arrayBuffer()
      const rawData = parseExcelBuffer(buffer)

      // 转换数据格式并验证
      const items = rawData.map((row) => ({
        certNo: String(row.certNo || ''),
        ownerName: String(row.ownerName || ''),
        ownerType: row.ownerType === 'TOWN_COLLECTIVE' ? 'TOWN_COLLECTIVE' : 'VILLAGE_COLLECTIVE',
        villageId: String(row.villageId || ''),
        idCard: row.idCard ? String(row.idCard) : undefined,
        phone: row.phone ? String(row.phone) : undefined,
        address: String(row.address || ''),
        area: Number(row.area) || 0,
        landUseType: row.landUseType ? String(row.landUseType) : undefined,
        certIssueDate: row.certIssueDate ? String(row.certIssueDate) : undefined,
        certExpiryDate: row.certExpiryDate ? String(row.certExpiryDate) : undefined,
        remark: row.remark ? String(row.remark) : undefined,
      }))

      // 验证数据
      const validationResult = batchImportSchema.safeParse({ items })

      if (!validationResult.success) {
        return {
          success: false,
          error: 'Excel 数据格式错误',
          details: validationResult.error.message,
        }
      }

      return { success: true, items: validationResult.data.items }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Excel 解析失败'
      return { success: false, error: errorMsg }
    }
  }

  return { success: false, error: '不支持的内容类型，请使用 JSON 或 Excel 文件上传' }
}

export async function POST(request: NextRequest) {
  try {
    // 解析请求（支持 JSON 和 Excel）
    const parseResult = await parseRequestData(request)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error, details: parseResult.details },
        { status: 400 },
      )
    }

    const { items } = parseResult
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
