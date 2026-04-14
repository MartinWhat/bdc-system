/**
 * 会话管理服务
 * 负责会话的创建、验证、销毁
 */

import { prisma } from '@/lib/prisma'
import { generateSessionToken } from '@/lib/auth'
import type { SysSession } from '@prisma/client'

/**
 * 创建新会话（双 Token 机制）
 * @param userId - 用户 ID
 * @param refreshToken - Refresh Token
 * @param accessTokenExpiresInHours - Access Token 过期时间（小时），默认 0.5 小时（30 分钟）
 * @param refreshTokenExpiresInDays - Refresh Token 过期时间（天），默认 7 天
 * @returns 会话对象
 */
export async function createSession(
  userId: string,
  refreshToken: string,
  accessTokenExpiresInHours: number = 0.5,
  refreshTokenExpiresInDays: number = 7,
) {
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + accessTokenExpiresInHours)

  const refreshTokenExpiresAt = new Date()
  refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + refreshTokenExpiresInDays)

  const session = await prisma.sysSession.create({
    data: {
      userId,
      token,
      expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      lastActivityAt: new Date(),
    },
  })

  return session
}

/**
 * 创建新会话（向后兼容，用于旧代码）
 * @param userId - 用户 ID
 * @param expiresInHours - 会话过期时间（小时），默认 24 小时
 * @returns 会话对象
 */
export async function createSessionLegacy(userId: string, expiresInHours: number = 24) {
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
 * 验证 Refresh Token
 * @param refreshToken - Refresh Token
 * @returns 会话对象或 null
 */
export async function validateRefreshToken(refreshToken: string) {
  const session = await prisma.sysSession.findUnique({
    where: { refreshToken },
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

  // 检查 Refresh Token 是否过期
  if (session.refreshTokenExpiresAt && new Date() > session.refreshTokenExpiresAt) {
    return null
  }

  // 检查用户状态
  if (session.user.status !== 'ACTIVE') {
    return null
  }

  // 更新最后活动时间
  await prisma.sysSession.update({
    where: { id: session.id },
    data: {
      lastActivityAt: new Date(),
    },
  })

  return session
}

/**
 * 轮换 Refresh Token
 * @param sessionId - 会话 ID
 * @param newRefreshToken - 新的 Refresh Token
 * @returns 更新后的会话
 */
export async function rotateRefreshToken(sessionId: string, newRefreshToken: string) {
  const refreshTokenExpiresAt = new Date()
  refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7)

  return prisma.sysSession.update({
    where: { id: sessionId },
    data: {
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt,
    },
  })
}

/**
 * 更新会话活动时间为 Access Token 过期时间
 * @param sessionId - 会话 ID
 * @param accessTokenExpiresInHours - Access Token 过期时间（小时）
 */
export async function updateSessionActivity(
  sessionId: string,
  accessTokenExpiresInHours: number = 0.5,
) {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + accessTokenExpiresInHours)

  return prisma.sysSession.update({
    where: { id: sessionId },
    data: {
      expiresAt,
      lastActivityAt: new Date(),
    },
  })
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
 * @param userId - 用户 ID
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
 * @param userId - 用户 ID
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
