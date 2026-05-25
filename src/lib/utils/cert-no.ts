/**
 * 证号归一化工具
 * 用于忽略空格、全角符号和常见标点差异，提升证号匹配容错性
 */

/**
 * 归一化证号
 * - 统一全角/半角字符
 * - 去掉空白字符
 * - 保留括号、中文和证号中的其他结构字符
 */
export function normalizeCertNo(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .normalize('NFKC')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[【]/g, '[')
    .replace(/[】]/g, ']')
    .trim()
    .replace(/\s+/g, '')
}

/**
 * 提取证号搜索关键字
 * 优先返回最长连续数字串，便于在数据库里做更窄的候选匹配
 */
export function getCertNoSearchKey(value: unknown): string {
  const normalized = normalizeCertNo(value)
  if (!normalized) {
    return ''
  }

  const digitChunks = normalized.match(/\d+/g)
  if (!digitChunks || digitChunks.length === 0) {
    return normalized
  }

  return digitChunks.reduce(
    (longest, chunk) => (chunk.length > longest.length ? chunk : longest),
    '',
  )
}

/**
 * 判断两个证号是否一致
 */
export function certNoMatches(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeCertNo(left)
  if (!normalizedLeft) {
    return false
  }

  return normalizedLeft === normalizeCertNo(right)
}

/**
 * 拆分不动产权证书号列表
 * 支持中文/英文逗号、顿号、分号、换行等分隔符
 */
export function splitCertNos(value: unknown): string[] {
  const normalized = normalizeCertNo(value)
  if (!normalized) {
    return []
  }

  return normalized
    .split(/[,，;；、\n\r\t]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 判断宅基地是否匹配指定证号
 * 优先匹配 certNos，其次回落到 certNo
 */
export function bdcMatchesCertNo(
  bdc: { certNo?: string; certNos?: string | null } | null | undefined,
  certNo: unknown,
): boolean {
  if (!bdc) {
    return false
  }

  const normalizedTarget = normalizeCertNo(certNo)
  if (!normalizedTarget) {
    return false
  }

  const certNos = splitCertNos(bdc.certNos)
  if (certNos.some((item) => normalizeCertNo(item) === normalizedTarget)) {
    return true
  }

  return normalizeCertNo(bdc.certNo) === normalizedTarget
}
