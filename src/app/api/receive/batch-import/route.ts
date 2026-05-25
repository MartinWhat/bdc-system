/**
 * 批量导入领证记录 API
 * POST /api/receive/batch-import - 批量导入已颁证宅基地生成待领证记录
 *
 * 支持两种导入方式：
 * 1. JSON 数据：{ items: [...] }
 * 2. Excel 文件：multipart/form-data，文件字段名 "file"
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseExcelBuffer, parseExcelDateValue } from '@/lib/excel-parser'
import { safeLogOperation } from '@/lib/log/safe'
import { getCertNoSearchKey, normalizeCertNo, splitCertNos } from '@/lib/utils/cert-no'
import { z } from 'zod'

// 导入数据项 schema
const importItemSchema = z.object({
  certNo: z.string().min(1, '证书编号不能为空'),
  ownerName: z.string().optional(),
  address: z.string().optional(),
  area: z.union([z.string(), z.number(), z.date()]).optional(),
  receiverName: z.string().optional(),
  receiverIdCard: z.string().optional(),
  receiverPhone: z.string().optional(),
  issueDate: z.union([z.string(), z.number(), z.date()]).optional(),
  receiveDate: z.union([z.string(), z.number(), z.date()]).optional(),
  signedBy: z.string().optional(),
  signedDate: z.union([z.string(), z.number(), z.date()]).optional(),
  status: z.enum(['PENDING', 'ISSUED', 'COMPLETED', 'CANCELLED']).optional(),
  remark: z.string().optional(),
})

// 批量导入请求 schema
const batchImportSchema = z.object({
  items: z.array(importItemSchema).min(1, '导入数据不能为空').max(100, '单次导入不能超过 100 条'),
})

type PreparedImportItem = {
  bdcId: string
  certNo: string
  ownerName?: string
  address?: string
  area?: string | number | Date
  receiverName?: string
  receiverIdCard?: string
  receiverPhone?: string
  issueDate: Date
  receiveDate?: Date | null
  signedBy?: string
  signedDate?: Date | null
  status: 'PENDING' | 'ISSUED' | 'COMPLETED' | 'CANCELLED'
  remark?: string
}

type ImportRowLog = {
  rowNo: number
  certNo: string
  ownerName?: string
  status: 'SUCCESS' | 'FAILED'
  reason?: string
  bdcId?: string
}

function normalizeReceiveStatus(value: unknown): PreparedImportItem['status'] | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    return undefined
  }

  const zhMap: Record<string, PreparedImportItem['status']> = {
    待领证: 'PENDING',
    未领: 'ISSUED',
    待签收: 'ISSUED',
    已发放: 'ISSUED',
    已领: 'COMPLETED',
    已领取: 'COMPLETED',
    已签收: 'COMPLETED',
    已完成: 'COMPLETED',
    已领证: 'COMPLETED',
    已取消: 'CANCELLED',
  }

  if (zhMap[value.trim()]) {
    return zhMap[value.trim()]
  }

  if (
    normalized === 'PENDING' ||
    normalized === 'ISSUED' ||
    normalized === 'COMPLETED' ||
    normalized === 'CANCELLED'
  ) {
    return normalized
  }

  return undefined
}

function isLegacyCompletedText(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const text = value.trim()
  return ['已领', '已领取', '已签收', '已完成', '已领证'].includes(text)
}

function collectLegacyRemarkParts(item: {
  remark?: string
  receiverName?: string
  receiveDate?: unknown
  signedDate?: unknown
}) {
  const remarkParts: string[] = []

  if (item.remark && item.remark.trim()) {
    remarkParts.push(item.remark.trim())
  }

  if (typeof item.receiverName === 'string') {
    const text = item.receiverName.trim()
    if (text && !isLegacyCompletedText(text)) {
      remarkParts.push(`领证人签名：${text}`)
    }
  }

  if (typeof item.receiveDate === 'string') {
    const text = item.receiveDate.trim()
    if (text && !isLegacyCompletedText(text)) {
      remarkParts.push(`签收时间：${text}`)
    }
  }

  if (typeof item.signedDate === 'string') {
    const text = item.signedDate.trim()
    if (text && !isLegacyCompletedText(text)) {
      remarkParts.push(`签收时间：${text}`)
    }
  }

  return remarkParts
}

function buildCertNoSearchConditions(certNos: string[]) {
  const seen = new Set<string>()
  const conditions: Record<string, unknown>[] = []

  for (const certNo of certNos) {
    const raw = certNo.trim()
    if (!raw) {
      continue
    }

    if (!seen.has(`eq:${raw}`)) {
      conditions.push({ certNo: raw })
      seen.add(`eq:${raw}`)
    }

    if (!seen.has(`certNos:${raw}`)) {
      conditions.push({ certNos: { contains: raw } })
      seen.add(`certNos:${raw}`)
    }

    const searchKey = getCertNoSearchKey(raw)
    if (searchKey && !seen.has(`contains:${searchKey}`)) {
      conditions.push({ certNo: { contains: searchKey } })
      seen.add(`contains:${searchKey}`)
    }

    if (searchKey && !seen.has(`certNosContains:${searchKey}`)) {
      conditions.push({ certNos: { contains: searchKey } })
      seen.add(`certNosContains:${searchKey}`)
    }
  }

  return conditions
}

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

      // 转换数据格式
      const items = rawData.map((row) => ({
        certNo: normalizeCertNo(row.certNo),
        ownerName: row.ownerName ? String(row.ownerName) : undefined,
        address: row.address ? String(row.address) : undefined,
        area: row.area ?? undefined,
        receiverName: row.receiverName ? String(row.receiverName) : undefined,
        receiverIdCard: row.receiverIdCard ? String(row.receiverIdCard) : undefined,
        receiverPhone: row.receiverPhone ? String(row.receiverPhone) : undefined,
        issueDate: row.issueDate ?? undefined,
        receiveDate: row.receiveDate ?? undefined,
        signedBy: row.signedBy ? String(row.signedBy) : undefined,
        signedDate: row.signedDate ?? undefined,
        status: normalizeReceiveStatus(row.status),
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

    const results = {
      success: [] as string[],
      failed: [] as { certNo: string; reason: string }[],
      rows: [] as ImportRowLog[],
    }

    // 批量处理：先查询所有宅基地
    const certNos = items.map((item) => item.certNo.trim()).filter(Boolean)
    const certNoConditions = buildCertNoSearchConditions(certNos)
    const bdcRecords = await prisma.zjdBdc.findMany({
      where: certNoConditions.length > 0 ? { OR: certNoConditions } : {},
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    // 创建映射
    const bdcMap = new Map<string, (typeof bdcRecords)[number]>()
    for (const bdc of bdcRecords) {
      const normalizedCertNo = normalizeCertNo(bdc.certNo)
      if (normalizedCertNo && !bdcMap.has(normalizedCertNo)) {
        bdcMap.set(normalizedCertNo, bdc)
      }
      if (!bdcMap.has(bdc.certNo)) {
        bdcMap.set(bdc.certNo, bdc)
      }
      for (const itemCertNo of splitCertNos(bdc.certNos)) {
        const normalizedItemCertNo = normalizeCertNo(itemCertNo)
        if (normalizedItemCertNo && !bdcMap.has(normalizedItemCertNo)) {
          bdcMap.set(normalizedItemCertNo, bdc)
        }
      }
    }

    // 检查已存在的领证记录
    const existingBdcIds = Array.from(new Set(bdcRecords.map((bdc) => bdc.id)))
    const existingRecords = await prisma.zjdReceiveRecord.findMany({
      where: {
        bdcId: { in: existingBdcIds },
        status: 'ISSUED',
      },
      select: { bdcId: true },
    })
    const existingBdcIdSet = new Set(existingRecords.map((r) => r.bdcId))
    const importedBdcIdSet = new Set<string>()

    // 批量创建领证记录
    const recordsToCreate = items
      .map<(PreparedImportItem & { rowNo: number }) | null>((item, index) => {
        const rowNo = index + 1
        results.rows.push({
          rowNo,
          certNo: item.certNo,
          ownerName: item.ownerName,
          status: 'FAILED',
          reason: '待处理',
        })

        const normalizedCertNo = normalizeCertNo(item.certNo)
        const bdc = bdcMap.get(normalizedCertNo) || bdcMap.get(item.certNo.trim())
        if (!bdc) {
          results.failed.push({ certNo: item.certNo, reason: '宅基地不存在' })
          results.rows[index] = {
            ...results.rows[index],
            status: 'FAILED',
            reason: '宅基地不存在',
          }
          return null
        }
        if (importedBdcIdSet.has(bdc.id)) {
          results.failed.push({ certNo: item.certNo, reason: '导入文件中存在重复证书编号' })
          results.rows[index] = {
            ...results.rows[index],
            status: 'FAILED',
            reason: '导入文件中存在重复证书编号',
            bdcId: bdc.id,
          }
          return null
        }
        if (item.ownerName && item.ownerName.trim() && item.ownerName.trim() !== bdc.ownerName) {
          results.failed.push({
            certNo: item.certNo,
            reason: `权利人不匹配（表格：${item.ownerName}，档案：${bdc.ownerName}）`,
          })
          results.rows[index] = {
            ...results.rows[index],
            status: 'FAILED',
            reason: `权利人不匹配（表格：${item.ownerName}，档案：${bdc.ownerName}）`,
            bdcId: bdc.id,
          }
          return null
        }
        const receiveDate = parseExcelDateValue(item.receiveDate)
        const signedDate = parseExcelDateValue(item.signedDate)
        const remarkParts = collectLegacyRemarkParts(item)
        const hasLegacyCompletedMarker =
          isLegacyCompletedText(item.receiverName) ||
          isLegacyCompletedText(item.receiveDate) ||
          isLegacyCompletedText(item.signedDate)
        const textStatus =
          normalizeReceiveStatus(item.status) ||
          normalizeReceiveStatus(item.receiveDate) ||
          normalizeReceiveStatus(item.signedDate) ||
          (hasLegacyCompletedMarker ? 'COMPLETED' : undefined)
        const finalStatus = textStatus || (receiveDate || signedDate ? 'COMPLETED' : 'ISSUED')
        const finalRemark = remarkParts.length > 0 ? remarkParts.join('；') : undefined
        if (existingBdcIdSet.has(bdc.id)) {
          results.failed.push({ certNo: item.certNo, reason: '已有待处理领证记录' })
          results.rows[index] = {
            ...results.rows[index],
            status: 'FAILED',
            reason: '已有待处理领证记录',
            bdcId: bdc.id,
          }
          return null
        }
        importedBdcIdSet.add(bdc.id)
        const issueDate = parseExcelDateValue(item.issueDate) || new Date()
        return {
          rowNo,
          bdcId: bdc.id,
          certNo: item.certNo,
          ownerName: bdc.ownerName,
          address: bdc.address,
          area: bdc.area,
          receiverName: undefined,
          receiverIdCard: item.receiverIdCard,
          receiverPhone: item.receiverPhone,
          issueDate,
          receiveDate: finalStatus === 'COMPLETED' ? receiveDate || issueDate : receiveDate,
          signedBy: item.signedBy,
          signedDate: signedDate || (finalStatus === 'COMPLETED' ? issueDate : null),
          status: finalStatus,
          remark: finalRemark,
        }
      })
      .filter((item): item is PreparedImportItem & { rowNo: number } => item !== null)

    if (recordsToCreate.length > 0) {
      // 使用事务批量创建
      await prisma.$transaction(async (tx) => {
        // 批量创建领证记录（导入即已发放状态）
        const createdRecords = await Promise.all(
          recordsToCreate.map((data) =>
            tx.zjdReceiveRecord.create({
              data: {
                bdcId: data.bdcId,
                status: data.status,
                issueDate: data.issueDate,
                receiveDate:
                  data.status === 'COMPLETED' ? data.receiveDate || data.issueDate : null,
                receiverName: data.receiverName,
                receiverIdCard: data.receiverIdCard,
                receiverPhone: data.receiverPhone,
                signedBy: data.signedBy || data.receiverName || operatorId,
                signedDate: data.signedDate || data.issueDate,
                remark: data.remark,
                createdBy: operatorId,
              },
            }),
          ),
        )

        await Promise.all(
          recordsToCreate.map((data) => {
            if (data.status === 'PENDING') {
              return Promise.resolve()
            }

            return tx.zjdBdc.update({
              where: { id: data.bdcId },
              data: { status: 'ISSUED' },
            })
          }),
        )

        // 批量创建流程节点
        await Promise.all(
          createdRecords.map((record) => {
            const item = recordsToCreate.find((i) => i.bdcId === record.bdcId)
            const nodes = [
              tx.processNode.create({
                data: {
                  receiveRecordId: record.id,
                  nodeType: 'ISSUE',
                  nodeName: '批量导入（已发放）',
                  operatorId,
                  operatorName: '系统',
                  description: `批量导入证书编号：${item?.certNo}，已自动发放`,
                },
              }),
            ]

            if (record.status === 'COMPLETED') {
              nodes.push(
                tx.processNode.create({
                  data: {
                    receiveRecordId: record.id,
                    nodeType: 'COMPLETE',
                    nodeName: '批量导入（已完成）',
                    operatorId,
                    operatorName: '系统',
                    description: `批量导入领证完成${item?.receiverName ? `，领取人：${item.receiverName}` : ''}`,
                  },
                }),
              )
            }

            return Promise.all(nodes)
          }),
        )

        // 记录成功的证书编号
        createdRecords.forEach((record) => {
          const source = recordsToCreate.find((item) => item.bdcId === record.bdcId)
          const bdc = bdcRecords.find((b) => b.id === record.bdcId)
          if (bdc) {
            results.success.push(bdc.certNo)
          }
          if (source) {
            const rowIndex = source.rowNo - 1
            results.rows[rowIndex] = {
              ...results.rows[rowIndex],
              status: 'SUCCESS',
              reason: `已${record.status === 'COMPLETED' ? '完成' : '导入'}`,
              bdcId: record.bdcId,
            }
          }
        })
      })
    }

    results.rows = results.rows.map((row) => {
      if (row.status === 'SUCCESS') {
        return row
      }
      return row.reason ? row : { ...row, reason: '导入失败' }
    })

    await safeLogOperation({
      userId: operatorId,
      action: 'BATCH_IMPORT',
      module: 'RECEIVE',
      description: `批量导入领证记录，成功 ${results.success.length} 条，失败 ${results.failed.length} 条`,
      status: 'SUCCESS',
    })

    return NextResponse.json({
      success: true,
      data: {
        total: items.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        results,
        rows: results.rows,
        successItems: results.rows.filter((row) => row.status === 'SUCCESS'),
        failedItems: results.rows.filter((row) => row.status === 'FAILED'),
      },
    })
  } catch (error) {
    console.error('Batch import error:', error)
    return NextResponse.json({ error: '批量导入失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
