/**
 * 操作日志服务
 * 负责记录和查询系统操作日志
 */

import { prisma } from '@/lib/prisma'

export interface LogOperationInput {
  userId: string
  bdcId?: string
  action: string
  module: string
  description: string
  ipAddress?: string
  userAgent?: string
  requestData?: string
  responseData?: string
  status?: 'SUCCESS' | 'FAILED'
}

/**
 * 记录操作日志
 * @param input - 日志信息
 * @returns 创建的日志记录
 */
export async function logOperation(input: LogOperationInput) {
  return prisma.operationLog.create({
    data: {
      userId: input.userId,
      bdcId: input.bdcId || null,
      action: input.action,
      module: input.module,
      description: input.description,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      requestData: input.requestData || null,
      responseData: input.responseData || null,
      status: input.status || 'SUCCESS',
    },
  })
}

/**
 * 查询操作日志列表
 * @param params - 查询参数
 * @returns 日志列表和总数
 */
export async function queryOperationLogs(params: {
  page: number
  pageSize: number
  userId?: string
  module?: string
  action?: string
  status?: string
  startDate?: string
  endDate?: string
}) {
  const { page, pageSize, userId, module, action, status, startDate, endDate } = params

  const where: any = {}

  if (userId) {
    where.userId = userId
  }

  if (module) {
    where.module = module
  }

  if (action) {
    where.action = action
  }

  if (status) {
    where.status = status
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate)
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate)
    }
  }

  const [total, logs] = await Promise.all([
    prisma.operationLog.count({ where }),
    prisma.operationLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        bdc: {
          select: {
            id: true,
            certNo: true,
            ownerName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    list: logs,
    total,
    page,
    pageSize,
  }
}

/**
 * 获取操作日志统计
 * @param days - 统计天数
 * @returns 统计数据
 */
export async function getOperationLogStats(days: number = 7) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const [totalLogs, successLogs, failedLogs, moduleStats] = await Promise.all([
    prisma.operationLog.count({
      where: { createdAt: { gte: startDate } },
    }),
    prisma.operationLog.count({
      where: {
        createdAt: { gte: startDate },
        status: 'SUCCESS',
      },
    }),
    prisma.operationLog.count({
      where: {
        createdAt: { gte: startDate },
        status: 'FAILED',
      },
    }),
    prisma.operationLog.groupBy({
      by: ['module'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { module: 'desc' } },
    }),
  ])

  return {
    totalLogs,
    successLogs,
    failedLogs,
    moduleStats: moduleStats.map((m) => ({
      module: m.module,
      count: m._count,
    })),
  }
}

/**
 * 清理过期日志
 * @param days - 保留天数
 * @returns 删除的日志数量
 */
export async function cleanupOldLogs(retainDays: number = 180) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retainDays)

  const result = await prisma.operationLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  })

  return result.count
}
