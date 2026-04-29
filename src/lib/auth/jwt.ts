/**
 * JWT 工具模块
 * 使用 jose 库 + HS256 算法（常量时间签名验证）
 */

import { SignJWT, jwtVerify } from 'jose'

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
 * JWT 验证错误类型
 */
export enum JWTErrorType {
  TOKEN_MALFORMED = 'TOKEN_MALFORMED', // Token 格式错误（不是三部分）
  TOKEN_SIGNATURE_INVALID = 'TOKEN_SIGNATURE_INVALID', // 签名无效
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // Token 已过期
  TOKEN_INVALID = 'TOKEN_INVALID', // 其他无效情况
}

export interface JWTVerifyResult {
  success: boolean
  payload?: JWTPayload
  error?: JWTErrorType
}

/**
 * 签发 JWT
 * @param payload - JWT 载荷
 * @param secret - 签名密钥
 * @param expiresIn - 过期时间（秒）
 * @returns JWT 字符串
 */
export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: number = 3600,
): Promise<string> {
  const encoder = new TextEncoder()
  const key = encoder.encode(secret)

  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key)
}

/**
 * 验证并解析 JWT（返回详细错误类型）
 * @param token - JWT 字符串
 * @param secret - 签名密钥
 * @returns 验证结果（包含成功/失败状态和具体错误类型）
 */
export async function verifyJWTDetailed(token: string, secret: string): Promise<JWTVerifyResult> {
  try {
    const encoder = new TextEncoder()
    const key = encoder.encode(secret)

    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    })

    return {
      success: true,
      payload: payload as unknown as JWTPayload,
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes('JWTExpired')) {
        return { success: false, error: JWTErrorType.TOKEN_EXPIRED }
      }
      if (err.message.includes('Invalid signature')) {
        return { success: false, error: JWTErrorType.TOKEN_SIGNATURE_INVALID }
      }
      if (err.message.includes('JWT malformed')) {
        return { success: false, error: JWTErrorType.TOKEN_MALFORMED }
      }
    }
    return { success: false, error: JWTErrorType.TOKEN_INVALID }
  }
}

/**
 * 验证并解析 JWT（旧版兼容，返回 null 表示失败）
 * @param token - JWT 字符串
 * @param secret - 签名密钥
 * @returns 解析后的载荷或 null
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const result = await verifyJWTDetailed(token, secret)
  return result.success && result.payload ? result.payload : null
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
