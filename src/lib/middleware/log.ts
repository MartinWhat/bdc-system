/**
 * 操作日志中间件
 * 自动记录 API 操作到数据库
 */

import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/log'

export interface LogMiddlewareOptions {
  module: string
  actionMap?: Record<string, string>
}

/**
 * 创建操作日志中间件
 * @param options - 配置选项
 * @returns 日志记录函数
 */
export function createLogMiddleware(options: LogMiddlewareOptions) {
  const { module, actionMap = {} } = options

  return async (
    userId: string,
    method: string,
    url: string,
    status: 'SUCCESS' | 'FAILED',
    description?: string,
    bdcId?: string,
    requestData?: string,
    responseData?: string,
    ipAddress?: string,
    userAgent?: string,
  ) => {
    try {
      // 从 actionMap 获取操作类型，否则从 HTTP 方法推断
      let action = actionMap[method] || method

      // 默认映射
      if (!actionMap[method]) {
        const defaultMap: Record<string, string> = {
          GET: 'QUERY',
          POST: 'CREATE',
          PUT: 'UPDATE',
          DELETE: 'DELETE',
        }
        action = defaultMap[method] || method
      }

      await logOperation({
        userId,
        bdcId,
        action,
        module,
        description: description || `${action} - ${url}`,
        ipAddress,
        userAgent,
        requestData,
        responseData,
        status,
      })
    } catch (error) {
      console.error('Log middleware error:', error)
      // 日志记录失败不应影响主流程
    }
  }
}

/**
 * 日志中间件工厂函数
 */
export const LogMiddleware = {
  /**
   * 用户管理日志中间件
   */
  user: createLogMiddleware({
    module: 'USER',
    actionMap: {
      POST: 'CREATE',
      PUT: 'UPDATE',
      DELETE: 'DELETE',
    },
  }),

  /**
   * 角色管理日志中间件
   */
  role: createLogMiddleware({
    module: 'ROLE',
    actionMap: {
      POST: 'CREATE',
      PUT: 'UPDATE',
      DELETE: 'DELETE',
    },
  }),

  /**
   * 宅基地管理日志中间件
   */
  bdc: createLogMiddleware({
    module: 'BDC',
    actionMap: {
      POST: 'CREATE',
      PUT: 'UPDATE',
      DELETE: 'CANCEL',
    },
  }),

  /**
   * 认证日志中间件
   */
  auth: createLogMiddleware({
    module: 'AUTH',
    actionMap: {
      POST: 'LOGIN',
    },
  }),
}
