/**
 * Cookie 管理模块
 * 用于安全地存储 Token（httpOnly + Secure + SameSite）
 */

import { NextRequest, NextResponse } from 'next/server'

// Cookie 配置
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // 生产环境仅 HTTPS
  sameSite: 'lax' as const, // 允许重定向后发送 Cookie
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 天（秒）
}

// Cookie 名称
const ACCESS_TOKEN_COOKIE = 'access_token'
const ACCESS_TOKEN_EXP_COOKIE = 'access_token_exp'
const REFRESH_TOKEN_COOKIE = 'refresh_token'
const USER_COOKIE = 'user_info'

/**
 * 从 document.cookie 读取用户信息（客户端专用）
 * 注意：user_info cookie 不是 httpOnly，所以可以被 JavaScript 读取
 */
export function getUserInfoFromClient(): unknown | null {
  if (typeof document === 'undefined') return null

  console.log('[DEBUG cookies] document.cookie:', document.cookie)
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === USER_COOKIE && value) {
      try {
        const userInfo = JSON.parse(decodeURIComponent(value))
        console.log('[DEBUG cookies] user_info cookie found:', userInfo)
        return userInfo
      } catch {
        console.log('[DEBUG cookies] failed to parse user_info cookie')
        return null
      }
    }
  }
  console.log('[DEBUG cookies] user_info cookie not found')
  return null
}

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
  user: unknown,
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

  // 用户信息 Cookie（仅存储非敏感基本信息，使用 encodeURIComponent 处理中文）
  const userJson = JSON.stringify(user)
  const encodedUserJson = encodeURIComponent(userJson)
  // 用户信息存储在客户端，用于 UI 显示
  // 注意：这里不使用 httpOnly，允许前端读取
  const userCookieOptions = {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: refreshTokenMaxAge,
  }
  const userCookieString = `${USER_COOKIE}=${encodedUserJson}; Path=${userCookieOptions.path}; SameSite=${userCookieOptions.sameSite}${
    userCookieOptions.secure ? '; Secure' : ''
  }${userCookieOptions.maxAge ? `; Max-Age=${userCookieOptions.maxAge}` : ''}`
  response.headers.append('Set-Cookie', userCookieString)
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
    // 解码 URL 编码的 Cookie 值
    const decodedUserStr = decodeURIComponent(userStr)
    return JSON.parse(decodedUserStr)
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
  deleteCookie(response, USER_COOKIE)
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
