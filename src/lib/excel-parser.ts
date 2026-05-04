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
  证书编号: 'certNo',
  备注: 'remark',

  // 村集体所有权字段
  所有权人名称: 'ownerName',
  所有权类型: 'ownerType',
  村居ID: 'villageId',
  村居名称: 'villageName',
  地址: 'address',
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
  到期日期: 'certExpiryDate',
  到期时间: 'certExpiryDate',
}

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
      const mappedKey = COLUMN_MAPPING[key] || key
      newRow[mappedKey] = value
    }
    return newRow
  })

  // 过滤空行
  return mappedData.filter((row) =>
    Object.values(row).some((val) => val !== '' && val !== null && val !== undefined),
  )
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

    // 解析为 JSON，第一行作为表头
    const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

    if (rawData.length === 0) {
      throw new Error('Excel 文件中没有数据')
    }

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
