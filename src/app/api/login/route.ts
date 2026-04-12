/**
 * POST /api/login
 * 用户登录接口
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateUserCredentials,
  updateLastLogin,
  getUserPermissions,
  getUserRoles,
} from '@/lib/auth/user-service'
import { signJWT } from '@/lib/auth'
import { createSession } from '@/lib/session'
import { getActiveKey } from '@/lib/kms'
import { z } from 'zod'

// 请求体验证
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  // 双因素验证码（二期实现，一期暂不使用）
  twoFactorCode: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validationResult = loginSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: validationResult.error.message,
        },
        { status: 400 },
      )
    }

    const { username, password } = validationResult.data

    // 验证用户凭据
    const user = await validateUserCredentials(username, password)

    if (!user) {
      return NextResponse.json(
        { error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      )
    }

    // 检查是否启用双因素认证
    // 注意：一期暂不实现双因素认证功能，此处代码保留但不会执行
    // TODO(二期): 实现 TOTP/短信验证码校验逻辑
    if (user.twoFactorEnabled) {
      // TODO: 验证双因素验证码
      return NextResponse.json(
        {
          error: '需要双因素认证',
          code: 'TWO_FACTOR_REQUIRED',
          requiresTwoFactor: true,
        },
        { status: 403 },
      )
    }

    // 获取用户角色和权限
    const roles = await getUserRoles(user.id)
    const permissions = await getUserPermissions(user.id)

    // 签发 JWT
    const jwtKeyRecord = await getActiveKey('JWT_SECRET')
    const token = signJWT(
      {
        sub: user.id,
        username: user.username,
        roles,
        permissions,
      },
      jwtKeyRecord.keyValue,
      3600, // 1小时过期
    )

    // 创建会话
    await createSession(user.id, 24)

    // 更新最后登录时间
    await updateLastLogin(user.id)

    // 返回登录成功响应
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          realName: user.realName,
          email: user.email,
          avatar: user.avatar,
          roles,
        },
        expiresIn: 3600,
      },
    })
  } catch (error: any) {
    console.error('Login error:', error)

    if (error.message === '用户已被禁用') {
      return NextResponse.json(
        { error: '用户已被禁用，请联系管理员', code: 'USER_DISABLED' },
        { status: 403 },
      )
    }

    return NextResponse.json(
      { error: '登录失败，请稍后重试', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
}
