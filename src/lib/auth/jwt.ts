/**
 * JWT 工具模块
 * 使用 SM3-HMAC 进行签名（不使用传统 HS256）
 */

import { sm3Hmac } from '@/lib/gm-crypto'

export interface JWTPayload {
  sub: string // 用户ID
  username: string
  roles?: string[]
  permissions?: string[]
  iat?: number // 签发时间
  exp?: number // 过期时间
}

export interface JWTHeader {
  alg: string
  typ: string
}

/**
 * Base64URL 编码
 */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const paddedData = padded + '='.repeat(padLength)
  return Buffer.from(paddedData, 'base64').toString('utf-8')
}

/**
 * 签发 JWT
 * @param payload - JWT 载荷
 * @param secret - 签名密钥
 * @param expiresIn - 过期时间（秒）
 * @returns JWT 字符串
 */
export function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: number = 3600,
): string {
  const header: JWTHeader = {
    alg: 'SM3-HMAC',
    typ: 'JWT',
  }

  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))

  const signatureInput = `${encodedHeader}.${encodedPayload}`
  const signature = sm3Hmac(signatureInput, secret)

  return `${signatureInput}.${signature}`
}

/**
 * 验证并解析 JWT
 * @param token - JWT 字符串
 * @param secret - 签名密钥
 * @returns 解析后的载荷或 null
 */
export function verifyJWT(token: string, secret: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, signature] = parts

    // 验证签名
    const signatureInput = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = sm3Hmac(signatureInput, secret)

    if (signature !== expectedSignature) {
      return null
    }

    // 解析载荷
    const payload: JWTPayload = JSON.parse(base64UrlDecode(encodedPayload))

    // 检查过期时间
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

/**
 * 从请求头中提取 JWT
 * @param authorization - Authorization 头
 * @returns JWT 字符串或 null
 */
export function extractTokenFromHeader(authorization?: string): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null
  }
  return authorization.slice(7)
}
