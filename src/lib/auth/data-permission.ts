/**
 * 数据权限过滤服务
 * 根据用户角色和所属村居/镇街过滤数据访问范围
 */

import { prisma } from '@/lib/prisma'

export type DataScope = 'ALL' | 'TOWN' | 'VILLAGE' | 'SELF'

export interface DataPermissionFilter {
  scope: DataScope
  townIds?: string[]
  villageIds?: string[]
  userId?: string
}

/**
 * 获取用户的数据权限范围
 * @param userId - 用户 ID
 * @returns 数据权限过滤器
 */
export async function getDataPermissionFilter(userId: string): Promise<DataPermissionFilter> {
  try {
    const user = await prisma.sysUser.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return { scope: 'SELF', userId }
    }

    // 管理员拥有所有数据权限
    const isAdmin = user.roles.some((ur) => ur.role.code === 'ADMIN')
    if (isAdmin) {
      return { scope: 'ALL' }
    }

    // 其他用户默认只能查看自己的数据
    return { scope: 'SELF', userId }
  } catch (error) {
    console.error('getDataPermissionFilter error:', error)
    // 出错时返回 ALL，允许查看所有数据
    return { scope: 'ALL' }
  }
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
