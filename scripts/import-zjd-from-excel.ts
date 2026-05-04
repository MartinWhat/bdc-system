/**
 * Excel 宅基地数据导入脚本
 * 将 工作簿1_合并.xlsx 数据导入到 ZjdBdc 表
 *
 * 运行: npx tsx scripts/import-zjd-from-excel.ts
 */

import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

// Excel 列名 → 英文字段 映射（全部28列）
const COL_MAPPING: Record<string, string> = {
  是否退件: 'isRejected',
  是否一窗业务: 'isOneWindow',
  收件编号: 'receiveId',
  业务宗号: 'businessNo',
  业务标题: 'businessTitle',
  申请人: 'applicant',
  坐落: 'originalAddress',
  受理人: 'acceptorName',
  受理日期: 'acceptDate',
  业务受理号: 'businessNo2',
  领证人: 'receiverName',
  领证时间: 'receiveTime',
  发证人: 'issuerName',
  退件人: 'rejectorName',
  退件时间: 'rejectTime',
  退件原因: 'rejectReason',
  JOBBASE_JID: 'jobbaseJid',
  JOBBASE_BCODE: 'jobbaseBcode',
  业务受理号2: 'businessNo3',
  不动产单元号: 'certNo',
  不动产坐落: 'address',
  权利人: 'ownerName',
  权利人证件号: 'idCard',
  面积: 'area',
  '不动产权证书（明）号': 'certNos',
  登记时间: 'certIssuedDate',
  登簿人: 'recorder',
  权属状态: 'status',
}

// 状态映射（已退件优先，其他按权属状态）
function mapStatus(status: string, isRejected: boolean): string {
  if (isRejected) return 'RETURNED' // 已退件
  if (!status) return 'PENDING'
  const s = status.trim()
  if (s === '现势') return 'ISSUED'
  if (s === '历史') return 'CANCELLED'
  return 'PENDING'
}

// village 匹配表 (从坐落地址提取村名匹配 villageId)
// 实际数据库ID
const VILLAGE_MAP: Record<string, string> = {
  // 新格式 (村)
  罗村村: 'village-罗村',
  沥林村: 'village-沥林',
  泮沥村: 'village-泮沥',
  埔心村: 'village-埔心',
  埔仔村: 'village-埔仔',
  英光村: 'village-英光',
  君子营村: 'village-君子营',
  企岭村: 'village-企岭',
  迭石龙村: 'village-迭石龙',
  山陂村: 'village-山陂',
  // 旧格式 (管理区)
  罗村管理区: 'village-罗村',
  沥林管理区: 'village-沥林',
  泮沥管理区: 'village-泮沥',
  埔心管理区: 'village-埔心',
  埔仔管理区: 'village-埔仔',
  英光管理区: 'village-英光',
  君子营管理区: 'village-君子营',
}

function extractVillageCode(address: string): string | null {
  if (!address) return null
  for (const [name, id] of Object.entries(VILLAGE_MAP)) {
    if (address.includes(name)) return id
  }
  return null
}

interface ImportRow {
  // ZjdBdc 核心字段
  certNo: string
  ownerName: string
  idCard: string
  address: string
  area: number
  status: string
  certIssuedDate: Date | null
  recorder: string // 登簿人
  certNos: string // 不动产权证书号（多个用逗号分隔）
  originalAddress: string // 原坐落
  rejectReason: string | null
  receiveId: string
  villageId: string | null
  // 业务字段
  applicant: string // 申请人
  receiverName: string // 领证人
  receiveTime: string // 领证时间
  issuerName: string // 发证人
  acceptorName: string // 受理人
  acceptDate: string // 受理日期
  businessNo: string // 业务受理号
  businessTitle: string // 业务标题
  isRejected: boolean
}

interface ImportResult {
  success: number
  failed: number
  unmatchedVillages: Set<string>
  failedRows: { row: number; reason: string }[]
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const str = String(value)
  // 处理 "2022/5/11 16:55:09" 格式
  const match = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
  }
  try {
    return new Date(str)
  } catch {
    return null
  }
}

async function processExcel(): Promise<ImportResult> {
  const excelPath = path.resolve(__dirname, '../../工作簿1_合并.xlsx')

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ 文件不存在: ${excelPath}`)
    process.exit(1)
  }

  console.log('📖 读取 Excel 文件...')
  const workbook = XLSX.readFile(excelPath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[]

  console.log(`📊 总行数: ${rawData.length}`)

  const result: ImportResult = {
    success: 0,
    failed: 0,
    unmatchedVillages: new Set<string>(),
    failedRows: [],
  }

  const rows: ImportRow[] = []

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i] as Record<string, unknown>
    const rowNum = i + 2

    // 收件编号（必填）
    const receiveId = String(row['收件编号'] || '').trim()
    if (!receiveId) {
      result.failed++
      result.failedRows.push({ row: rowNum, reason: '收件编号为空' })
      continue
    }

    // 不动产单元号（certNo）
    const certNo = String(row['不动产单元号'] || '').trim()
    const finalCertNo = certNo || `PENDING-${receiveId}`

    // 权利人（必填）
    const ownerName = String(row['权利人'] || row['申请人'] || '').trim()
    if (!ownerName) {
      result.failed++
      result.failedRows.push({ row: rowNum, reason: '权利人为空' })
      continue
    }

    // 地址
    const 不动产坐落 = String(row['不动产坐落'] || '').trim()
    const 坐落 = String(row['坐落'] || '').trim()
    const address = 不动产坐落 || 坐落
    if (!address) {
      result.failed++
      result.failedRows.push({ row: rowNum, reason: '坐落地址为空' })
      continue
    }

    // villageId 匹配
    const villageId = extractVillageCode(address)
    if (!villageId) {
      result.unmatchedVillages.add(address)
    }

    // 证件号
    const idCard = String(row['权利人证件号'] || '').trim()

    // 面积
    const areaStr = String(row['面积'] || '').trim()
    const area = parseFloat(areaStr) || 0

    // 登记时间
    const certIssuedDate = parseExcelDate(row['登记时间'])

    // 登簿人
    const recorder = String(row['登簿人'] || '').trim()

    // 证书号
    const certNos = String(row['不动产权证书（明）号'] || '').trim()

    // 原坐落（仅当与不动产坐落不同时记录）
    const originalAddress = 坐落 && 坐落 !== 不动产坐落 ? 坐落 : ''

    // 退件原因
    const 是否退件 = String(row['是否退件'] || '').trim()
    const 退件原因 = String(row['退件原因'] || '').trim()
    const isRejected = 是否退件 === '已退件'
    const rejectReason = isRejected ? 退件原因 : null

    // 状态映射
    const status = mapStatus(String(row['权属状态'] || ''), isRejected)

    // 业务字段
    const applicant = String(row['申请人'] || '').trim()
    const receiverName = String(row['领证人'] || '').trim()
    const receiveTimeStr = String(row['领证时间'] || '').trim()
    const issuerName = String(row['发证人'] || '').trim()
    const acceptorName = String(row['受理人'] || '').trim()
    const acceptDateStr = String(row['受理日期'] || '').trim()
    const businessNo2 = String(row['业务受理号'] || '').trim()
    const businessTitle = String(row['业务标题'] || '').trim()

    // 解析领证时间、受理日期
    let receiveTime = ''
    let acceptDate = ''
    if (receiveTimeStr) {
      const d = parseExcelDate(receiveTimeStr)
      receiveTime = d ? d.toISOString().slice(0, 10) : receiveTimeStr
    }
    if (acceptDateStr) {
      const d = parseExcelDate(acceptDateStr)
      acceptDate = d ? d.toISOString().slice(0, 10) : acceptDateStr
    }

    rows.push({
      certNo: finalCertNo,
      ownerName,
      idCard,
      address,
      area,
      status,
      certIssuedDate,
      recorder,
      certNos,
      originalAddress,
      rejectReason,
      receiveId,
      villageId,
      applicant,
      receiverName,
      receiveTime,
      issuerName,
      acceptorName,
      acceptDate,
      businessNo: businessNo2,
      businessTitle,
      isRejected,
    })

    result.success++
  }

  // 输出结果
  console.log('\n========== 导入分析结果 ==========')
  console.log(`✅ 成功处理: ${result.success} 行`)
  console.log(`❌ 失败: ${result.failed} 行`)

  if (result.unmatchedVillages.size > 0) {
    console.log(`\n⚠️  未匹配 villageId 的地址 (${result.unmatchedVillages.size} 个):`)
    Array.from(result.unmatchedVillages)
      .slice(0, 20)
      .forEach((addr) => console.log(`   - ${addr}`))
    if (result.unmatchedVillages.size > 20) {
      console.log(`   ... 还有 ${result.unmatchedVillages.size - 20} 个`)
    }
  }

  // 写入 JSON 供后续导入
  const outputPath = path.resolve(__dirname, '../../zjd-import-data.json')
  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8')
  console.log(`\n💾 数据已保存到: ${outputPath}`)

  // 写入失败行报告
  if (result.failedRows.length > 0) {
    const failedPath = path.resolve(__dirname, '../../zjd-import-failed.json')
    fs.writeFileSync(failedPath, JSON.stringify(result.failedRows, null, 2), 'utf-8')
    console.log(`⚠️  失败行报告: ${failedPath}`)
  }

  // 打印样本数据
  console.log('\n========== 样本数据 ==========')
  rows.slice(0, 3).forEach((r, i) => {
    console.log(`\n--- 第 ${i + 1} 条 ---`)
    console.log(`  certNo: ${r.certNo}`)
    console.log(`  ownerName: ${r.ownerName}`)
    console.log(`  idCard: ${r.idCard}`)
    console.log(`  address: ${r.address}`)
    console.log(`  area: ${r.area}`)
    console.log(`  status: ${r.status}`)
    console.log(`  certIssuedDate: ${r.certIssuedDate}`)
    console.log(`  recorder: ${r.recorder}`)
    console.log(`  certNos: ${r.certNos}`)
    console.log(`  originalAddress: ${r.originalAddress}`)
    console.log(`  rejectReason: ${r.rejectReason}`)
    console.log(`  receiveId: ${r.receiveId}`)
    console.log(`  villageId: ${r.villageId}`)
    console.log(`  applicant: ${r.applicant}`)
    console.log(`  receiverName: ${r.receiverName}`)
    console.log(`  receiveTime: ${r.receiveTime}`)
    console.log(`  issuerName: ${r.issuerName}`)
    console.log(`  acceptorName: ${r.acceptorName}`)
    console.log(`  acceptDate: ${r.acceptDate}`)
    console.log(`  businessTitle: ${r.businessTitle}`)
  })

  return result
}

processExcel().catch(console.error)
