/**
 * 加密查询辅助函数
 * 用于通过哈希索引查询加密字段
 */

import { generateQueryHash } from '@/lib/gm-crypto'
import { prisma } from '@/lib/prisma'

/**
 * 通过身份证号查询宅基地记录
 * @param idCard - 身份证号明文
 * @returns 宅基地记录或 null
 */
export async function findBdcByIdCard(idCard: string) {
  const idCardHash = await generateQueryHash(idCard)

  return prisma.zjdBdc.findFirst({
    where: { idCardHash },
    include: { village: true },
  })
}

/**
 * 通过手机号查询用户记录
 * @param phone - 手机号明文
 * @returns 用户记录或 null
 */
export async function findUserByPhone(phone: string) {
  const phoneHash = await generateQueryHash(phone)

  return prisma.sysUser.findFirst({
    where: { phoneHash },
  })
}

/**
 * 通过身份证号查询用户记录
 * @param idCard - 身份证号明文
 * @returns 用户记录或 null
 */
export async function findUserByIdCard(idCard: string) {
  const idCardHash = await generateQueryHash(idCard)

  return prisma.sysUser.findFirst({
    where: { idCardHash },
  })
}

/**
 * 构建加密字段查询条件
 * @param fieldName - 字段名（如 idCardHash, phoneHash）
 * @param plainValue - 明文值
 * @returns Prisma 查询条件
 */
export async function buildEncryptedWhereClause(
  fieldName: string,
  plainValue: string,
): Promise<Record<string, any>> {
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
): Promise<Record<string, any>> {
  const hashes = await Promise.all(plainValues.map((value) => generateQueryHash(value)))
  return { [fieldName]: { in: hashes } }
}
