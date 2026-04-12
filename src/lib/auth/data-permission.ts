/**
 * 数据权限过滤服务
 * 根据用户角色和所属村居/镇街过滤数据访问范围
 */

import { prisma } from '@/lib/prisma'
import { getUserOrganization } from './user-organization'

export type DataScope = 'ALL' | 'TOWN' | 'VILLAGE' | 'SELF'

export interface DataPermissionFilter {
  scope: DataScope
  townIds?: string[]
  villageIds?: string[]
  userId?: string
}

/**
 * 获取用户的数据权限范围
 * @param userId - 用户ID
 * @returns 数据权限过滤器
 */
export async function getDataPermissionFilter(userId: string): Promise<DataPermissionFilter> {
  const user = await prisma.sysUser.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!user) {
    return { scope: 'SELF', userId }
  }

  // 检查是否有全部数据权限
  const hasAllPermission = user.roles.some((ur) =>
    ur.role.permissions.some((rp) => rp.permission.code === 'data:scope:all'),
  )

  if (hasAllPermission) {
    return { scope: 'ALL' }
  }

  // 检查是否有镇街级权限
  const hasTownPermission = user.roles.some((ur) =>
    ur.role.permissions.some((rp) => rp.permission.code === 'data:scope:town'),
  )

  // 检查是否有村居级权限
  const hasVillagePermission = user.roles.some((ur) =>
    ur.role.permissions.some((rp) => rp.permission.code === 'data:scope:village'),
  )

  // TODO: 从用户关联中获取具体的镇街/村居ID
  // 当前简化实现：从用户创建的记录中推断
  const userOrg = await getUserOrganization(userId)

  if (hasTownPermission) {
    return { scope: 'TOWN', townIds: userOrg.townIds, userId }
  }

  if (hasVillagePermission) {
    return { scope: 'VILLAGE', villageIds: userOrg.villageIds, userId }
  }

  // 默认只能查看自己的数据
  return { scope: 'SELF', userId }
}

/**
 * 构建宅基地查询条件（根据数据权限）
 * @param filter - 数据权限过滤器
 * @returns Prisma 查询条件
 */
export function buildBdcWhereClause(filter: DataPermissionFilter) {
  const where: Record<string, unknown> = {}

  switch (filter.scope) {
    case 'ALL':
      // 无限制
      break
    case 'TOWN':
      if (filter.townIds && filter.townIds.length > 0) {
        where.village = {
          townId: { in: filter.townIds },
        }
      }
      break
    case 'VILLAGE':
      if (filter.villageIds && filter.villageIds.length > 0) {
        where.villageId = { in: filter.villageIds }
      }
      break
    case 'SELF':
      if (filter.userId) {
        where.createdBy = filter.userId
      }
      break
  }

  return where
}
