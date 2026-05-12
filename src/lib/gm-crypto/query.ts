/**
 * 明文查询辅助函数
 * 当前项目已切回明文存储，兼容原有接口命名。
 */

import { prisma } from '@/lib/prisma'
import { generateQueryHash as generateQueryHashBase } from '@/lib/gm-crypto/encryption'

/**
 * 生成查询哈希（辅助函数）
 * @param value - 敏感值
 * @returns 哈希值
 */
export async function generateQueryHash(value: string): Promise<string> {
  return generateQueryHashBase(value)
}

/**
 * 通过身份证号查询宅基地记录
 * @param idCard - 身份证号明文
 * @returns 宅基地记录或 null
 */
export async function findBdcByIdCard(idCard: string) {
  return prisma.zjdBdc.findFirst({
    where: { idCard },
    include: { village: true },
  })
}

/**
 * 通过手机号查询用户记录
 * @param phone - 手机号明文
 * @returns 用户记录或 null
 */
export async function findUserByPhone(phone: string) {
  return prisma.sysUser.findFirst({
    where: { phone },
  })
}

/**
 * 通过身份证号查询用户记录
 * @param idCard - 身份证号明文
 * @returns 用户记录或 null
 */
export async function findUserByIdCard(idCard: string) {
  return prisma.sysUser.findFirst({
    where: { idCard },
  })
}

/**
 * 构建加密字段查询条件
 * @param fieldName - 字段名（如 idCard, phone）
 * @param plainValue - 明文值
 * @returns Prisma 查询条件
 */
export async function buildEncryptedWhereClause(
  fieldName: string,
  plainValue: string,
): Promise<Record<string, string>> {
  const hash = await generateQueryHash(plainValue)
  return { [fieldName]: hash }
}

/**
 * 批量查询加密字段
 * @param fieldName - 哈希字段名
 * @param plainValues - 明文值数组
 * @returns Prisma 查询条件
 */
export async function buildEncryptedInClause(
  fieldName: string,
  plainValues: string[],
): Promise<Record<string, { in: string[] }>> {
  const hashes = await Promise.all(plainValues.map((value) => generateQueryHash(value)))
  return { [fieldName]: { in: hashes } }
}
