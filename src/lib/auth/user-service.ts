/**
 * 用户服务模块
 * 负责用户的创建、查询、验证等操作
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword, validateUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import type { SysUser } from '@prisma/client'

export interface CreateUserInput {
  username: string
  password: string
  realName: string
  idCard?: string
  phone?: string
  email?: string
  createdBy?: string
}

/**
 * 创建新用户
 * @param input - 用户信息
 * @returns 创建的用户对象（不含密码哈希和盐）
 */
export async function createUser(input: CreateUserInput) {
  // 密码加密
  const { passwordHash, salt } = hashUserPassword(input.password)

  const createData: {
    username: string
    passwordHash: string
    salt: string
    realName: string
    email?: string | null
    createdBy: string
    status: string
    idCard?: string
    phone?: string
  } = {
    username: input.username,
    passwordHash,
    salt,
    realName: input.realName,
    email: input.email,
    createdBy: input.createdBy || 'system',
    status: 'ACTIVE',
  }

  // 加密身份证号
  if (input.idCard) {
    const idCardResult = await encryptSensitiveField(input.idCard)
    createData.idCard = idCardResult.encrypted
  }

  // 加密手机号
  if (input.phone) {
    const phoneResult = await encryptSensitiveField(input.phone)
    createData.phone = phoneResult.encrypted
  }

  const user = await prisma.sysUser.create({
    data: createData,
    select: {
      id: true,
      username: true,
      realName: true,
      email: true,
      avatar: true,
      status: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return user
}

/**
 * 通过用户名查找用户
 * @param username - 用户名
 * @returns 用户对象（含密码哈希）
 */
export async function findUserByUsername(username: string) {
  return prisma.sysUser.findUnique({
    where: { username },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

/**
 * 验证用户登录凭据
 * @param username - 用户名
 * @param password - 密码
 * @returns 用户对象或 null
 */
export async function validateUserCredentials(username: string, password: string) {
  const user = await findUserByUsername(username)

  if (!user) {
    return null
  }

  // 检查用户状态
  if (user.status !== 'ACTIVE') {
    throw new Error('用户已被禁用')
  }

  // 验证密码
  const isValid = validateUserPassword(password, user.passwordHash, user.salt)

  if (!isValid) {
    return null
  }

  return user
}

/**
 * 更新用户最后登录时间
 * @param userId - 用户ID
 */
export async function updateLastLogin(userId: string) {
  await prisma.sysUser.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  })
}

/**
 * 获取用户权限列表
 * @param userId - 用户ID
 * @returns 权限代码数组
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.sysUser.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!user) {
    return []
  }

  const permissions = new Set<string>()
  for (const userRole of user.roles) {
    for (const rolePerm of userRole.role.permissions) {
      permissions.add(rolePerm.permission.code)
    }
  }

  return Array.from(permissions)
}

/**
 * 获取用户角色列表
 * @param userId - 用户ID
 * @returns 角色代码数组
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  const user = await prisma.sysUser.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  })

  if (!user) {
    return []
  }

  return user.roles.map((ur) => ur.role.code)
}
