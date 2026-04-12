/**
 * 会话管理服务
 * 负责会话的创建、验证、销毁
 */

import { prisma } from '@/lib/prisma'
import { generateSessionToken } from '@/lib/auth'
import type { SysSession } from '@prisma/client'

/**
 * 创建新会话
 * @param userId - 用户ID
 * @param expiresInHours - 会话过期时间（小时），默认24小时
 * @returns 会话对象
 */
export async function createSession(userId: string, expiresInHours: number = 24) {
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + expiresInHours)

  const session = await prisma.sysSession.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  })

  return session
}

/**
 * 验证会话令牌
 * @param token - 会话令牌
 * @returns 会话对象或 null
 */
export async function validateSession(token: string) {
  const session = await prisma.sysSession.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          realName: true,
          status: true,
        },
      },
    },
  })

  if (!session) {
    return null
  }

  // 检查会话是否过期
  if (new Date() > session.expiresAt) {
    // 删除过期会话
    await prisma.sysSession.delete({
      where: { id: session.id },
    })
    return null
  }

  // 检查用户状态
  if (session.user.status !== 'ACTIVE') {
    return null
  }

  return session
}

/**
 * 销毁会话（登出）
 * @param token - 会话令牌
 */
export async function destroySession(token: string) {
  await prisma.sysSession.deleteMany({
    where: { token },
  })
}

/**
 * 销毁用户的所有会话
 * @param userId - 用户ID
 */
export async function destroyAllUserSessions(userId: string) {
  await prisma.sysSession.deleteMany({
    where: { userId },
  })
}

/**
 * 清理过期会话
 * @returns 删除的会话数量
 */
export async function cleanupExpiredSessions() {
  const result = await prisma.sysSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })

  return result.count
}

/**
 * 获取用户的活跃会话
 * @param userId - 用户ID
 * @returns 会话列表
 */
export async function getUserSessions(userId: string) {
  return prisma.sysSession.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}
