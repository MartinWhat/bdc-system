/**
 * Cookie 管理模块
 * 用于安全地存储 Token（httpOnly + Secure + SameSite）
 * 用户信息使用 AES-256-GCM 加密，密钥仅存在于服务端
 */

import { NextRequest, NextResponse } from 'next/server'
import { encrypt, decrypt } from './crypto'

/**
 * 加密用户信息（服务端用，AES-256-GCM）
 */
export function encodeUserInfo(userInfo: unknown): string {
  return encrypt(userInfo)
}

/**
 * 解密用户信息（服务端用，AES-256-GCM）
 */
export function decodeUserInfo(encoded: string): unknown | null {
  return decrypt(encoded)
}

// Cookie 配置
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // 生产环境仅 HTTPS
  sameSite: 'strict' as const, // 增强 CSRF 防护
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 天（秒）
}

// Cookie 名称
const ACCESS_TOKEN_COOKIE = 'access_token'
const ACCESS_TOKEN_EXP_COOKIE = 'access_token_exp'
const REFRESH_TOKEN_COOKIE = 'refresh_token'
export const USER_COOKIE = 'user_info'

/**
 * 设置 Cookie 到响应中
 */
export function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: Partial<typeof COOKIE_OPTIONS> = {},
) {
  const cookieOptions = {
    ...COOKIE_OPTIONS,
    ...options,
  }

  const cookieString = `${name}=${value}; Path=${cookieOptions.path}; SameSite=${cookieOptions.sameSite}${
    cookieOptions.httpOnly ? '; HttpOnly' : ''
  }${
    cookieOptions.secure ? '; Secure' : ''
  }${cookieOptions.maxAge ? `; Max-Age=${cookieOptions.maxAge}` : ''}`

  response.headers.append('Set-Cookie', cookieString)
}

/**
 * 从请求中获取 Cookie 值
 */
export function getCookie(request: NextRequest, name: string): string | null {
  const cookie = request.cookies.get(name)
  return cookie?.value || null
}

/**
 * 删除 Cookie
 */
export function deleteCookie(response: NextResponse, name: string) {
  const cookieString = `${name}=; Path=/; SameSite=strict; HttpOnly; Max-Age=0`
  response.headers.append('Set-Cookie', cookieString)
}

/**
 * 设置双 Token Cookie
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  _user?: unknown, // 保留参数用于向后兼容，但不再使用
) {
  const accessTokenMaxAge = 3600 // 1 小时（秒）
  const refreshTokenMaxAge = 60 * 60 * 24 * 7 // 7 天

  // Access Token Cookie（1 小时）
  setCookie(response, ACCESS_TOKEN_COOKIE, accessToken, {
    maxAge: accessTokenMaxAge,
  })

  // Access Token 过期时间（非 httpOnly，供客户端读取用于主动刷新）
  // 存储 Unix 时间戳（秒）
  const accessTokenExp = Math.floor(Date.now() / 1000) + accessTokenMaxAge
  setCookie(response, ACCESS_TOKEN_EXP_COOKIE, String(accessTokenExp), {
    httpOnly: false, // 允许 JavaScript 读取
    maxAge: accessTokenMaxAge,
  })

  // Refresh Token Cookie（7 天）
  setCookie(response, REFRESH_TOKEN_COOKIE, refreshToken, {
    maxAge: refreshTokenMaxAge,
  })

  // 注意：user_info Cookie 已废弃，改用 /api/auth/me 接口获取用户信息
  // 这样可以避免 Cookie 大小限制和 XSS 风险
}

/**
 * 获取 Access Token
 */
export function getAccessToken(request: NextRequest): string | null {
  return getCookie(request, ACCESS_TOKEN_COOKIE)
}

/**
 * 获取 Refresh Token
 */
export function getRefreshToken(request: NextRequest): string | null {
  return getCookie(request, REFRESH_TOKEN_COOKIE)
}

/**
 * 获取用户信息
 */
export function getUserFromCookie(request: NextRequest): unknown | null {
  const userStr = getCookie(request, USER_COOKIE)
  if (!userStr) return null
  try {
    // 解密 AES-256-GCM 加密的 Cookie 值
    return decodeUserInfo(userStr)
  } catch {
    return null
  }
}

/**
 * 清除认证 Cookie
 */
export function clearAuthCookies(response: NextResponse) {
  deleteCookie(response, ACCESS_TOKEN_COOKIE)
  deleteCookie(response, ACCESS_TOKEN_EXP_COOKIE)
  deleteCookie(response, REFRESH_TOKEN_COOKIE)
  // user_info Cookie 已废弃，不再删除
}

/**
 * 从请求头中提取 Token（向后兼容，支持 Bearer Token）
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

/**
 * 从请求中获取 Token（优先 Cookie，其次 Header）
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  // 优先从 Cookie 获取
  const cookieToken = getAccessToken(request)
  if (cookieToken) {
    return cookieToken
  }

  // 其次从 Header 获取（向后兼容）
  const authHeader = request.headers.get('authorization')
  return extractTokenFromHeader(authHeader || undefined)
}
