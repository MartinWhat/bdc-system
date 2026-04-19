/**
 * 统计报表导出 API
 * GET /api/stats/export - 导出统计报表
 * 支持格式: xlsx, csv, pdf
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import PDFDocument from 'pdfkit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'bdc' // bdc, cert, trend
    const format = searchParams.get('format') || 'xlsx' // xlsx, csv, pdf
    const townId = searchParams.get('townId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // 构建基础查询条件
    const baseWhere: Record<string, unknown> = {}
    if (townId) {
      baseWhere.village = { townId }
    }
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      baseWhere.createdAt = dateFilter
    }

    const now = new Date()
    const fileName = `统计报表_${type}_${now.toISOString().split('T')[0]}`

    // PDF 导出
    if (format === 'pdf') {
      return await exportPDF(type, baseWhere, fileName)
    }

    // Excel/CSV 导出
    return await exportExcelOrCsv(type, baseWhere, fileName, format)
  } catch (error) {
    console.error('Export stats error:', error)
    return NextResponse.json({ error: '导出失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

/**
 * 导出 PDF
 */
async function exportPDF(
  type: string,
  baseWhere: Record<string, unknown>,
  fileName: string,
): Promise<NextResponse> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' })
      const chunks: Buffer[] = []

      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks)
        resolve(
          new NextResponse(pdfBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.pdf"`,
            },
          }),
        )
      })
      doc.on('error', reject)

      // 标题
      doc.fontSize(20).text('统计报表', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).text(`导出时间: ${new Date().toLocaleString('zh-CN')}`)
      doc.moveDown(2)

      // 宅基地统计
      if (type === 'bdc' || type === 'all') {
        doc.fontSize(16).text('宅基地统计', { underline: true })
        doc.moveDown()
        renderBdcStatsPDF(doc, baseWhere)
        doc.moveDown(2)
      }

      // 村集体证书统计
      if (type === 'cert' || type === 'all') {
        doc.fontSize(16).text('村集体证书统计', { underline: true })
        doc.moveDown()
        renderCertStatsPDF(doc, baseWhere)
        doc.moveDown(2)
      }

      // 趋势分析
      if (type === 'trend' || type === 'all') {
        doc.fontSize(16).text('趋势分析', { underline: true })
        doc.moveDown()
        renderTrendStatsPDF(doc)
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 渲染宅基地统计 PDF
 */
async function renderBdcStatsPDF(doc: PDFKit.PDFDocument, baseWhere: Record<string, unknown>) {
  const statusMap: Record<string, string> = {
    PENDING: '待审核',
    APPROVED: '已批准',
    ISSUED: '已发放',
    COMPLETED: '已完成',
    CANCELLED: '已注销',
  }

  // 总数统计
  const totalCount = await prisma.zjdBdc.count({ where: baseWhere })
  doc.fontSize(12).text(`宅基地总数: ${totalCount}`)

  // 按状态统计
  const statusStats = await prisma.zjdBdc.groupBy({
    by: ['status'],
    where: baseWhere,
    _count: true,
  })

  doc.moveDown(0.5)
  doc.fontSize(11).text('按状态分布:')
  statusStats.forEach((s) => {
    doc.fontSize(10).text(`  - ${statusMap[s.status] || s.status}: ${s._count}`)
  })

  // 按镇街统计
  const townStats = await prisma.zjdBdc.groupBy({
    by: ['villageId'],
    where: baseWhere,
    _count: true,
  })

  if (townStats.length > 0) {
    const villageIds = townStats.map((s) => s.villageId)
    const villages = await prisma.sysVillage.findMany({
      where: { id: { in: villageIds } },
      include: { town: { select: { name: true } } },
    })

    const townSummary: Record<string, number> = {}
    townStats.forEach((stat) => {
      const village = villages.find((v) => v.id === stat.villageId)
      const townName = village?.town?.name || '未知'
      townSummary[townName] = (townSummary[townName] || 0) + stat._count
    })

    doc.moveDown(0.5)
    doc.fontSize(11).text('按镇街分布:')
    Object.entries(townSummary).forEach(([townName, count]) => {
      doc.fontSize(10).text(`  - ${townName}: ${count}`)
    })
  }
}

/**
 * 渲染村集体证书统计 PDF
 */
async function renderCertStatsPDF(doc: PDFKit.PDFDocument, baseWhere: Record<string, unknown>) {
  const certStatusMap: Record<string, string> = {
    IN_STOCK: '在库',
    OUT_STOCK: '已出库',
    RETURNED: '已归还',
    CANCELLED: '已注销',
    FROZEN: '已冻结',
    PENDING_APPROVE: '待审核',
  }

  const ownerTypeMap: Record<string, string> = {
    VILLAGE_COLLECTIVE: '村集体',
    TOWN_COLLECTIVE: '镇集体',
  }

  // 总数统计
  const totalCount = await prisma.collectiveCert.count({ where: baseWhere })
  doc.fontSize(12).text(`村集体证书总数: ${totalCount}`)

  // 按状态统计
  const statusStats = await prisma.collectiveCert.groupBy({
    by: ['status'],
    where: baseWhere,
    _count: true,
  })

  doc.moveDown(0.5)
  doc.fontSize(11).text('按状态分布:')
  statusStats.forEach((s) => {
    doc.fontSize(10).text(`  - ${certStatusMap[s.status] || s.status}: ${s._count}`)
  })

  // 按所有权类型统计
  const ownerTypeStats = await prisma.collectiveCert.groupBy({
    by: ['ownerType'],
    where: baseWhere,
    _count: true,
  })

  doc.moveDown(0.5)
  doc.fontSize(11).text('按所有权类型分布:')
  ownerTypeStats.forEach((s) => {
    doc.fontSize(10).text(`  - ${ownerTypeMap[s.ownerType] || s.ownerType}: ${s._count}`)
  })
}

/**
 * 渲染趋势分析 PDF
 */
async function renderTrendStatsPDF(doc: PDFKit.PDFDocument) {
  const year = new Date().getFullYear()

  // 宅基地按月统计
  const bdcMonthly = await prisma.zjdBdc.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
    },
    _count: true,
  })

  // 村集体证书按月统计
  const certMonthly = await prisma.collectiveCert.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
    },
    _count: true,
  })

  // 按月汇总
  const monthlyData: Record<string, { bdc: number; cert: number }> = {}
  for (let i = 1; i <= 12; i++) {
    monthlyData[String(i)] = { bdc: 0, cert: 0 }
  }

  bdcMonthly.forEach((s) => {
    const month = s.createdAt.getMonth() + 1
    monthlyData[String(month)].bdc += s._count
  })

  certMonthly.forEach((s) => {
    const month = s.createdAt.getMonth() + 1
    monthlyData[String(month)].cert += s._count
  })

  doc.fontSize(11).text(`${year}年月度统计:`)
  doc.moveDown(0.5)

  const monthNames = [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ]
  let totalBdc = 0
  let totalCert = 0

  Object.entries(monthlyData).forEach(([month, data]) => {
    totalBdc += data.bdc
    totalCert += data.cert
    doc
      .fontSize(10)
      .text(`  ${monthNames[parseInt(month) - 1]}: 宅基地 ${data.bdc}, 证书 ${data.cert}`)
  })

  doc.moveDown(1)
  doc.fontSize(11).text(`年度合计: 宅基地 ${totalBdc}, 村集体证书 ${totalCert}`)
}

/**
 * 导出 Excel 或 CSV
 */
async function exportExcelOrCsv(
  type: string,
  baseWhere: Record<string, unknown>,
  fileName: string,
  format: string,
): Promise<NextResponse> {
  let workbook = XLSX.utils.book_new()

  if (type === 'bdc' || type === 'all') {
    const bdcData = await prisma.zjdBdc.findMany({
      where: baseWhere,
      include: {
        village: {
          include: { town: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const statusMap: Record<string, string> = {
      PENDING: '待审核',
      APPROVED: '已批准',
      ISSUED: '已发放',
      COMPLETED: '已完成',
      CANCELLED: '已注销',
    }

    const sheetData = bdcData.map((bdc) => ({
      证书编号: bdc.certNo,
      权利人: bdc.ownerName,
      身份证号: bdc.idCard,
      联系电话: bdc.phone || '',
      地址: bdc.address,
      '面积(㎡)': bdc.area,
      '批准面积(㎡)': bdc.approvedArea || '',
      土地用途: bdc.landUseType,
      状态: statusMap[bdc.status] || bdc.status,
      镇街: bdc.village.town?.name || '',
      村居: bdc.village.name,
      创建时间: bdc.createdAt.toISOString().split('T')[0],
    }))

    const worksheet = XLSX.utils.json_to_sheet(sheetData)
    XLSX.utils.book_append_sheet(workbook, worksheet, '宅基地统计')

    // 状态汇总
    const statusStats = await prisma.zjdBdc.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    })

    const summaryData = statusStats.map((s) => ({
      状态: statusMap[s.status] || s.status,
      数量: s._count,
    }))

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, '状态汇总')
  }

  if (type === 'cert' || type === 'all') {
    const certData = await prisma.collectiveCert.findMany({
      where: baseWhere,
      include: {
        village: {
          include: { town: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const certStatusMap: Record<string, string> = {
      IN_STOCK: '在库',
      OUT_STOCK: '已出库',
      RETURNED: '已归还',
      CANCELLED: '已注销',
      FROZEN: '已冻结',
      PENDING_APPROVE: '待审核',
    }

    const ownerTypeMap: Record<string, string> = {
      VILLAGE_COLLECTIVE: '村集体',
      TOWN_COLLECTIVE: '镇集体',
    }

    const sheetData = certData.map((cert) => ({
      证书编号: cert.certNo,
      所有权人: cert.ownerName,
      所有权类型: ownerTypeMap[cert.ownerType] || cert.ownerType,
      地址: cert.address,
      '面积(㎡)': cert.area,
      土地用途: cert.landUseType || '',
      状态: certStatusMap[cert.status] || cert.status,
      是否冻结: cert.isFrozen ? '是' : '否',
      镇街: cert.village.town?.name || '',
      村居: cert.village.name,
      创建时间: cert.createdAt.toISOString().split('T')[0],
    }))

    const worksheet = XLSX.utils.json_to_sheet(sheetData)
    XLSX.utils.book_append_sheet(workbook, worksheet, '村集体证书统计')
  }

  if (type === 'trend' || type === 'all') {
    const year = new Date().getFullYear()

    const bdcMonthly = await prisma.zjdBdc.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
      },
      _count: true,
    })

    const certMonthly = await prisma.collectiveCert.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
      },
      _count: true,
    })

    const logMonthly = await prisma.operationLog.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
      },
      _count: true,
    })

    const monthlyData: Record<string, { bdc: number; cert: number; log: number }> = {}
    for (let i = 1; i <= 12; i++) {
      monthlyData[String(i)] = { bdc: 0, cert: 0, log: 0 }
    }

    bdcMonthly.forEach((s) => {
      const month = s.createdAt.getMonth() + 1
      monthlyData[String(month)].bdc += s._count
    })

    certMonthly.forEach((s) => {
      const month = s.createdAt.getMonth() + 1
      monthlyData[String(month)].cert += s._count
    })

    logMonthly.forEach((s) => {
      const month = s.createdAt.getMonth() + 1
      monthlyData[String(month)].log += s._count
    })

    const trendData = Object.entries(monthlyData).map(([month, data]) => ({
      月份: `${year}-${month.padStart(2, '0')}`,
      宅基地新增: data.bdc,
      村集体证书新增: data.cert,
      操作日志: data.log,
    }))

    const worksheet = XLSX.utils.json_to_sheet(trendData)
    XLSX.utils.book_append_sheet(workbook, worksheet, '趋势分析')
  }

  // 生成文件
  let buffer: ArrayBuffer

  if (format === 'csv') {
    buffer = XLSX.write(workbook, { type: 'array', bookType: 'csv' }) as ArrayBuffer
  } else {
    buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }

  const contentType =
    format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.${format}"`,
    },
  })
}
