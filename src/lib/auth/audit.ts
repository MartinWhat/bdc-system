import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/log'

export type AuthAuditAction = 'LOGIN' | 'LOGOUT'

export type AuthAuditEvent = {
  action: AuthAuditAction
  description: string
}

const AUTH_LOGIN_PATHS: Array<[string, string]> = [
  ['/sign-in/username', '用户名密码登录'],
  ['/sign-in/email', '邮箱登录'],
  ['/sign-in/social', '社交账号登录'],
  ['/passkey/verify-authentication', 'Passkey 登录'],
  ['/two-factor/verify-totp', '完成二次验证登录'],
  ['/two-factor/verify-otp', '完成二次验证登录'],
  ['/two-factor/verify-backup-code', '使用备用码完成登录'],
]

export function resolveAuthAuditEvent(path?: string | null): AuthAuditEvent | null {
  if (!path) {
    return null
  }

  if (path === '/sign-out') {
    return {
      action: 'LOGOUT',
      description: '用户登出',
    }
  }

  for (const [candidatePath, description] of AUTH_LOGIN_PATHS) {
    if (path === candidatePath) {
      return {
        action: 'LOGIN',
        description,
      }
    }
  }

  return null
}

export function getRequestIp(headers?: Headers | null): string | undefined {
  if (!headers) {
    return undefined
  }

  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || undefined
  }

  return (
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    headers.get('true-client-ip') ||
    undefined
  )
}

export function getRequestUserAgent(headers?: Headers | null): string | undefined {
  if (!headers) {
    return undefined
  }

  return headers.get('user-agent') || undefined
}

export async function recordAuthLoginAudit(input: {
  userId: string
  description: string
  headers?: Headers | null
}) {
  const ipAddress = getRequestIp(input.headers)
  const userAgent = getRequestUserAgent(input.headers)

  try {
    await prisma.sysUser.update({
      where: { id: input.userId },
      data: { lastLoginAt: new Date() },
    })
  } catch (error) {
    console.error('[AuthAudit] Failed to update lastLoginAt:', error)
  }

  try {
    await logOperation({
      userId: input.userId,
      action: 'LOGIN',
      module: 'AUTH',
      description: input.description,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
    })
  } catch (error) {
    console.error('[AuthAudit] Failed to write login log:', error)
  }
}

export async function recordAuthLogoutAudit(input: {
  userId: string
  description: string
  headers?: Headers | null
}) {
  const ipAddress = getRequestIp(input.headers)
  const userAgent = getRequestUserAgent(input.headers)

  try {
    await logOperation({
      userId: input.userId,
      action: 'LOGOUT',
      module: 'AUTH',
      description: input.description,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
    })
  } catch (error) {
    console.error('[AuthAudit] Failed to write logout log:', error)
  }
}
