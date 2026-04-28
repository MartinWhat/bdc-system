/**
 * 会话管理服务
 * 负责会话的创建、验证、销毁
 */

import { prisma } from '@/lib/prisma'
import { generateSessionToken } from '@/lib/auth'
import { sm3Hash } from '@/lib/gm-crypto'
import { AUTH_CONFIG } from '@/lib/auth/config'
import type { SysSession } from '@prisma/client'

/**
 * 哈希 Refresh Token
 * @param refreshToken - 明文 Refresh Token
 * @returns 哈希值
 */
function hashRefreshToken(refreshToken: string): string {
  return sm3Hash(refreshToken)
}

/**
 * 创建新会话（双 Token 机制）
 * @param userId - 用户 ID
 * @param refreshToken - Refresh Token（明文）
 * @param accessTokenExpiresInHours - Access Token 过期时间（小时），默认从 AUTH_CONFIG 读取
 * @param refreshTokenExpiresInDays - Refresh Token 过期时间（天），默认从 AUTH_CONFIG 读取
 * @returns 会话对象
 */
export async function createSession(
  userId: string,
  refreshToken: string,
  accessTokenExpiresInHours: number = AUTH_CONFIG.SESSION_ACCESS_TOKEN_HOURS,
  refreshTokenExpiresInDays: number = AUTH_CONFIG.REFRESH_TOKEN_EXPIRES_IN_DAYS,
) {
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + accessTokenExpiresInHours)

  const refreshTokenExpiresAt = new Date()
  refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + refreshTokenExpiresInDays)

  // 存储 RefreshToken 的哈希值，而非明文
  const refreshTokenHash = hashRefreshToken(refreshToken)

  const session = await prisma.sysSession.create({
    data: {
      userId,
      token,
      expiresAt,
      refreshTokenHash,
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

  // 检查会话是否已撤销
  if (session.isRevoked) {
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
 * @param refreshToken - Refresh Token（明文）
 * @returns 会话对象或 null
 */
export async function validateRefreshToken(refreshToken: string) {
  // 使用哈希值查询会话
  const refreshTokenHash = hashRefreshToken(refreshToken)

  const session = await prisma.sysSession.findUnique({
    where: { refreshTokenHash },
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
 * 轮换 Refresh Token（原子操作，修复竞态条件）
 * @param oldRefreshToken - 旧的 Refresh Token（明文）
 * @param newRefreshToken - 新的 Refresh Token（明文）
 * @returns 更新后的会话或 null（如果旧 token 无效）
 */
export async function rotateRefreshToken(
  oldRefreshToken: string,
  newRefreshToken: string,
): Promise<SysSession | null> {
  const refreshTokenExpiresAt = new Date()
  refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7)

  const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken)
  const newRefreshTokenHash = hashRefreshToken(newRefreshToken)

  // 使用事务确保原子性，防止竞态条件
  const session = await prisma.$transaction(async (tx) => {
    // 使用原子更新：WHERE refreshTokenHash = oldHash，防止竞态条件
    const updatedSession = await tx.sysSession.updateMany({
      where: {
        refreshTokenHash: oldRefreshTokenHash,
        refreshTokenExpiresAt: {
          gt: new Date(), // 确保未过期
        },
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        refreshTokenExpiresAt,
        lastActivityAt: new Date(),
      },
    })

    if (updatedSession.count === 0) {
      return null
    }

    // 获取更新后的会话
    return tx.sysSession.findFirst({
      where: {
        refreshTokenHash: newRefreshTokenHash,
      },
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
  })

  return session
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
  await prisma.sysSession.updateMany({
    where: { token },
    data: { isRevoked: true, revokedAt: new Date() },
  })
}

/**
 * 主动撤销会话（用于黑名单）
 * @param token - 会话令牌
 */
export async function revokeSession(token: string): Promise<boolean> {
  const result = await prisma.sysSession.updateMany({
    where: { token, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  })
  return result.count > 0
}

/**
 * 销毁用户的所有会话
 * @param userId - 用户 ID
 */
export async function destroyAllUserSessions(userId: string) {
  await prisma.sysSession.updateMany({
    where: { userId },
    data: { isRevoked: true, revokedAt: new Date() },
  })
}

/**
 * 主动撤销用户的所有会话
 * @param userId - 用户 ID
 * @returns 被撤销的会话数量
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.sysSession.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  })
  return result.count
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
