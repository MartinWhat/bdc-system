/**
 * 用户组织关联配置
 * 用于存储用户所属的镇街和村居
 */

import { prisma } from '@/lib/prisma'

export interface UserOrganization {
  userId: string
  townIds: string[]
  villageIds: string[]
}

/**
 * 获取用户关联的组织（镇街/村居）
 * @param userId - 用户ID
 * @returns 用户组织信息
 */
export async function getUserOrganization(userId: string): Promise<UserOrganization> {
  // 当前简化实现：从用户创建记录中推断其所属组织
  // 后续可通过新增 SysUserOrganization 表来显式管理

  // 获取用户创建的宅基地记录，从中提取 villageId
  const userBdcRecords = await prisma.zjdBdc.findMany({
    where: { createdBy: userId },
    select: { villageId: true },
    distinct: ['villageId'],
  })

  const villageIds = userBdcRecords.map((r) => r.villageId)

  // 从村居获取镇街
  const townIds: string[] = []
  if (villageIds.length > 0) {
    const villages = await prisma.sysVillage.findMany({
      where: { id: { in: villageIds } },
      select: { townId: true },
      distinct: ['townId'],
    })
    townIds.push(...villages.map((v) => v.townId))
  }

  return {
    userId,
    townIds: [...new Set(townIds)],
    villageIds: [...new Set(villageIds)],
  }
}
