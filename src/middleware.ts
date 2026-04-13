/**
 * Next.js Middleware - 在所有请求上执行
 */

import { NextRequest, NextResponse } from 'next/server'
import { authMiddleware } from '@/lib/middleware'

export async function middleware(request: NextRequest) {
  // 运行认证中间件
  const authResponse = await authMiddleware(request)

  // 如果认证中间件返回了响应（如 401），直接返回
  if (authResponse) {
    return authResponse
  }

  // 否则继续处理请求
  return NextResponse.next()
}

// 配置中间件匹配路径
export const config = {
  matcher: [
    /*
     * 匹配所有 API 路径和非文件页面
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// 使用 Node.js 运行时以支持 Prisma
export const runtime = 'nodejs'
