/**
 * Excel 文件解析工具
 * 支持 .xlsx 和 .xls 格式，自动处理中文列名映射
 *
 * 提供两种解析方式：
 * - parseExcelFile: 浏览器端使用，接收 File 对象
 * - parseExcelBuffer: 服务端使用，接收 Buffer/ArrayBuffer
 */

import * as XLSX from 'xlsx'

/**
 * 中文列名到英文字段的映射表
 */
export const COLUMN_MAPPING: Record<string, string> = {
  // 通用字段
  不动产单元号: 'certNo',
  不动产证号: 'certNo',
  不动产权证号: 'certNo',
  证书编号: 'certNo',
  备注: 'remark',
  状态: 'status',
  领证状态: 'status',

  // 村集体所有权字段
  所有权人名称: 'ownerName',
  权利人: 'ownerName',
  权利人姓名: 'ownerName',
  使用权人: 'ownerName',
  所有权类型: 'ownerType',
  村居ID: 'villageId',
  村居名称: 'villageName',
  房屋坐落: 'address',
  地址: 'address',
  宗地面积: 'area',
  '宗地面积(㎡)': 'area',
  '宗地面积（㎡）': 'area',
  面积: 'area',
  '面积(平方米)': 'area',
  '面积（平方米）': 'area',
  身份证号: 'idCard',
  身份证号码: 'idCard',
  手机号: 'phone',
  联系电话: 'phone',
  用途类型: 'landUseType',
  土地用途: 'landUseType',
  发证日期: 'certIssueDate',
  发证时间: 'certIssueDate',
  登记时间: 'certIssuedDate',
  到期日期: 'certExpiryDate',
  到期时间: 'certExpiryDate',

  // 领证/签收字段
  领证人: 'receiverName',
  领取人: 'receiverName',
  领证人姓名: 'receiverName',
  领取人姓名: 'receiverName',
  领证人签名: 'receiverName',
  领证人身份证号: 'receiverIdCard',
  领取人身份证号: 'receiverIdCard',
  领证身份证号: 'receiverIdCard',
  领证人手机号: 'receiverPhone',
  领取人手机号: 'receiverPhone',
  领证手机号: 'receiverPhone',
  发放日期: 'issueDate',
  发放时间: 'issueDate',
  领证日期: 'receiveDate',
  领取日期: 'receiveDate',
  签收日期: 'receiveDate',
  签收人: 'signedBy',
  发证人: 'signedBy',
  签收时间: 'signedDate',
}

function normalizeHeaderKey(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const NORMALIZED_COLUMN_MAPPING: Record<string, string> = Object.entries(COLUMN_MAPPING).reduce(
  (acc, [key, mappedKey]) => {
    const normalizedKey = normalizeHeaderKey(key)
    if (normalizedKey && !acc[normalizedKey]) {
      acc[normalizedKey] = mappedKey
    }
    return acc
  },
  {} as Record<string, string>,
)

/**
 * 反向映射：英文字段名到中文列名
 */
export const REVERSE_COLUMN_MAPPING: Record<string, string> = Object.entries(COLUMN_MAPPING).reduce(
  (acc, [cn, en]) => {
    if (!acc[en]) {
      acc[en] = cn
    }
    return acc
  },
  {} as Record<string, string>,
)

/**
 * 处理中文列名映射（内部函数）
 */
function mapColumnNames(rawData: unknown[]): Record<string, unknown>[] {
  // 处理中文列名映射
  const mappedData = rawData.map((row) => {
    const newRow: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      const normalizedKey = normalizeHeaderKey(key)
      const mappedKey = COLUMN_MAPPING[key] || NORMALIZED_COLUMN_MAPPING[normalizedKey] || key
      newRow[mappedKey] = value
    }
    return newRow
  })

  // 过滤空行
  return mappedData.filter((row) =>
    Object.values(row).some((val) => val !== '' && val !== null && val !== undefined),
  )
}

function isNonEmptyCell(value: unknown): boolean {
  return value !== '' && value !== null && value !== undefined
}

function detectHeaderRowIndex(rows: unknown[][]): number {
  let bestIndex = -1
  let bestScore = 0
  const scanLimit = Math.min(rows.length, 20)

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) {
      continue
    }

    let score = 0
    for (const cell of row) {
      const normalizedKey = normalizeHeaderKey(cell)
      if (!normalizedKey) {
        continue
      }

      if (COLUMN_MAPPING[String(cell)] || NORMALIZED_COLUMN_MAPPING[normalizedKey]) {
        score += 2
      } else if (normalizedKey === '序号' || normalizedKey === '编号' || normalizedKey === '姓名') {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestIndex = rowIndex
    }
  }

  return bestScore > 0 ? bestIndex : -1
}

function parseRowsWithDetectedHeader(worksheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][]
  if (rows.length === 0) {
    throw new Error('Excel 文件中没有数据')
  }

  const headerRowIndex = detectHeaderRowIndex(rows)
  if (headerRowIndex < 0) {
    throw new Error('未找到有效表头，请确认 Excel 前几行包含证书编号等字段')
  }

  const headerRow = rows[headerRowIndex] || []
  const dataRows = rows.slice(headerRowIndex + 1)
  const mappedRows = dataRows
    .map((row) => {
      const obj: Record<string, unknown> = {}
      headerRow.forEach((headerCell, index) => {
        const headerText = String(headerCell ?? '').trim()
        if (!headerText) {
          return
        }

        const value = row?.[index]
        if (isNonEmptyCell(value)) {
          obj[headerText] = value
        }
      })
      return obj
    })
    .filter((row) => Object.keys(row).length > 0)

  if (mappedRows.length === 0) {
    throw new Error('Excel 文件中没有可导入的数据')
  }

  return mappedRows
}

/**
 * 解析 Excel 日期值
 * 支持 Date、Excel 序列号和常见字符串日期
 */
export function parseExcelDateValue(value: unknown): Date | null {
  if (!value && value !== 0) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) {
      return null
    }
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S)
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  const normalized = text.replace(/\./g, '/')
  const date = new Date(normalized)
  if (!Number.isNaN(date.getTime())) {
    return date
  }

  const matched = text.match(
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (!matched) {
    return null
  }

  const year = Number(matched[1])
  const month = Number(matched[2]) - 1
  const day = Number(matched[3])
  const hour = Number(matched[4] || 0)
  const minute = Number(matched[5] || 0)
  const second = Number(matched[6] || 0)
  const fallback = new Date(year, month, day, hour, minute, second)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

/**
 * 服务端 Excel 解析函数
 * @param buffer Buffer 或 ArrayBuffer（来自 FormData 或文件上传）
 * @returns 解析后的数据数组
 */
export function parseExcelBuffer(buffer: Buffer | ArrayBuffer): Record<string, unknown>[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // 读取第一个工作表
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new Error('Excel 文件中没有工作表')
    }

    const worksheet = workbook.Sheets[sheetName]
    const rawData = parseRowsWithDetectedHeader(worksheet)
    return mapColumnNames(rawData)
  } catch (error) {
    throw new Error('Excel 文件解析失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

/**
 * 浏览器端 Excel 解析函数
 * @param file File 对象（浏览器端）
 * @returns 解析后的数据数组
 */
export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer
        const result = parseExcelBuffer(data)
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * 验证 Excel 数据
 * @param data 解析后的数据
 * @param requiredFields 必填字段列表
 * @returns 验证结果
 */
export function validateExcelData(
  data: Record<string, unknown>[],
  requiredFields: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (data.length === 0) {
    return { valid: false, errors: ['数据为空'] }
  }

  // 检查列是否存在
  const firstRow = data[0]
  const missingColumns = requiredFields.filter((field) => !(field in firstRow))

  if (missingColumns.length > 0) {
    const chineseNames = missingColumns.map((field) => REVERSE_COLUMN_MAPPING[field] || field)
    errors.push(`缺少必填列: ${chineseNames.join(', ')}`)
  }

  // 检查每一行的数据
  data.forEach((row, index) => {
    const rowNumber = index + 1 // Excel 行号从 1 开始，但数据行要跳过表头

    requiredFields.forEach((field) => {
      const value = row[field]
      const chineseName = REVERSE_COLUMN_MAPPING[field] || field

      if (value === '' || value === null || value === undefined) {
        errors.push(`第 ${rowNumber} 行: "${chineseName}" 不能为空`)
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 生成 Excel 模板
 * @param headers 表头配置数组 [{ key: 'certNo', title: '证书编号', example: '3301010010010001' }]
 * @returns Excel 文件的 Blob
 */
export function generateExcelTemplate(
  headers: { key: string; title: string; example?: string }[],
  filename: string,
): Blob {
  // 第一行：中文表头
  const chineseHeaders = headers.map((h) => h.title)

  // 第二行：英文字段名
  const englishHeaders = headers.map((h) => h.key)

  // 第三行：示例数据
  const exampleData = headers.map((h) => h.example || '')

  // 创建工作表数据
  const wsData = [chineseHeaders, englishHeaders, exampleData]

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // 设置列宽
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  // 创建工作簿
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, filename)

  // 生成 Blob
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 下载 Excel 模板
 * @param headers 表头配置
 * @param filename 文件名
 */
export function downloadExcelTemplate(
  headers: { key: string; title: string; example?: string }[],
  filename: string,
): void {
  const blob = generateExcelTemplate(headers, filename)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
