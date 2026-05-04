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
import { parseExcelBuffer } from '@/lib/excel-parser'
import { z } from 'zod'

// 导入数据项 schema
const importItemSchema = z.object({
  certNo: z.string().min(1, '证书编号不能为空'),
  remark: z.string().optional(),
})

// 批量导入请求 schema
const batchImportSchema = z.object({
  items: z.array(importItemSchema).min(1, '导入数据不能为空').max(100, '单次导入不能超过 100 条'),
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

      // 转换数据格式（只需要证书编号）
      const items = rawData.map((row) => ({
        certNo: String(row.certNo || ''),
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
    }

    // 批量处理：先查询所有宅基地
    const certNos = items.map((item) => item.certNo)
    const bdcRecords = await prisma.zjdBdc.findMany({
      where: { certNo: { in: certNos } },
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    // 创建映射
    const bdcMap = new Map(bdcRecords.map((bdc) => [bdc.certNo, bdc] as const))

    // 检查已存在的领证记录
    const existingBdcIds = bdcRecords.map((bdc) => bdc.id)
    const existingRecords = await prisma.zjdReceiveRecord.findMany({
      where: {
        bdcId: { in: existingBdcIds },
        status: 'ISSUED',
      },
      select: { bdcId: true },
    })
    const existingBdcIdSet = new Set(existingRecords.map((r) => r.bdcId))

    // 批量创建领证记录
    const recordsToCreate = items
      .map((item) => {
        const bdc = bdcMap.get(item.certNo)
        if (!bdc) {
          results.failed.push({ certNo: item.certNo, reason: '宅基地不存在' })
          return null
        }
        if (existingBdcIdSet.has(bdc.id)) {
          results.failed.push({ certNo: item.certNo, reason: '已有待处理领证记录' })
          return null
        }
        return {
          bdcId: bdc.id,
          remark: item.remark,
        }
      })
      .filter(Boolean)

    if (recordsToCreate.length > 0) {
      // 使用事务批量创建
      await prisma.$transaction(async (tx) => {
        // 批量创建领证记录（导入即已发放状态）
        const createdRecords = await Promise.all(
          recordsToCreate.map((data) =>
            tx.zjdReceiveRecord.create({
              data: {
                bdcId: data!.bdcId,
                status: 'ISSUED',
                issueDate: new Date(),
                remark: data!.remark,
                createdBy: operatorId,
              },
            }),
          ),
        )

        // 批量创建流程节点
        await Promise.all(
          createdRecords.map((record) => {
            const item = items.find((i) => bdcMap.get(i.certNo)?.id === record.bdcId)
            return tx.processNode.create({
              data: {
                receiveRecordId: record.id,
                nodeType: 'ISSUE',
                nodeName: '批量导入（已发放）',
                operatorId,
                operatorName: '系统',
                description: `批量导入证书编号：${item?.certNo}，已自动发放`,
              },
            })
          }),
        )

        // 记录成功的证书编号
        createdRecords.forEach((record) => {
          const bdc = bdcRecords.find((b) => b.id === record.bdcId)
          if (bdc) {
            results.success.push(bdc.certNo)
          }
        })
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        total: items.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        results,
      },
    })
  } catch (error) {
    console.error('Batch import error:', error)
    return NextResponse.json({ error: '批量导入失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
