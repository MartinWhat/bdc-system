/**
 * 数据脱敏工具函数
 * 用于身份证号、手机号等敏感字段的显示脱敏
 */

/**
 * 脱敏身份证号
 * @param idCard - 身份证号
 * @returns 脱敏后的身份证号
 */
export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 7) return idCard
  return idCard.slice(0, 3) + '*'.repeat(idCard.length - 7) + idCard.slice(-4)
}

/**
 * 脱敏手机号
 * @param phone - 手机号
 * @returns 脱敏后的手机号
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

/**
 * 脱敏姓名
 * @param name - 姓名
 * @returns 脱敏后的姓名（只显示第一个字）
 */
export function maskName(name: string): string {
  if (!name || name.length < 2) return name
  return name[0] + '*'.repeat(name.length - 1)
}

/**
 * 脱敏邮箱
 * @param email - 邮箱地址
 * @returns 脱敏后的邮箱
 */
export function maskEmail(email: string): string {
  if (!email) return email
  const [local, domain] = email.split('@')
  if (!local || !domain) return email

  const maskedLocal = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***'

  return maskedLocal + '@' + domain
}

/**
 * 脱敏地址（保留前 3 个字符，其余用 * 替换）
 * @param address - 地址
 * @returns 脱敏后的地址
 */
export function maskAddress(address: string): string {
  if (!address || address.length < 4) return address
  return address.slice(0, 3) + '*'.repeat(address.length - 3)
}

/**
 * 通用数据脱敏（递归处理对象）
 * @param data - 数据对象
 * @param fields - 需要脱敏的字段列表
 * @returns 脱敏后的数据
 */
export function maskData<T extends Record<string, unknown>>(data: T, fields: string[]): T {
  const result = { ...data } as T

  for (const field of fields) {
    const value = result[field as keyof T]
    if (typeof value === 'string') {
      if (field.includes('idCard') || field.includes('IdCard')) {
        ;(result as any)[field] = maskIdCard(value)
      } else if (field.includes('phone') || field.includes('Phone')) {
        ;(result as any)[field] = maskPhone(value)
      } else if (field.includes('name') || field.includes('Name')) {
        ;(result as any)[field] = maskName(value)
      } else if (field.includes('address') || field.includes('Address')) {
        ;(result as any)[field] = maskAddress(value)
      } else if (field.includes('email') || field.includes('Email')) {
        ;(result as any)[field] = maskEmail(value)
      }
    }
  }

  return result
}
