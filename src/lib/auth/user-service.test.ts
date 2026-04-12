import { describe, it, expect, beforeAll } from 'vitest'
import {
  createUser,
  findUserByUsername,
  validateUserCredentials,
  getUserPermissions,
  getUserRoles,
} from '@/lib/auth/user-service'
import { prisma } from '@/lib/prisma'
import { seedTestKeys } from '@/test/helpers'
import { getDataPermissionFilter, buildBdcWhereClause } from '@/lib/auth/data-permission'

describe('用户管理', () => {
  beforeAll(async () => {
    await seedTestKeys()
  })

  it('应该创建用户', async () => {
    const user = await createUser({
      username: `testuser_mgmt_${Date.now()}`,
      password: 'testpass123',
      realName: '测试管理用户',
    })

    expect(user.username).toContain('testuser_mgmt')
    expect(user.realName).toBe('测试管理用户')
  })

  it('应该查询到创建的用户', async () => {
    const users = await prisma.sysUser.findMany({
      where: { username: { startsWith: 'testuser_mgmt' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    expect(users.length).toBeGreaterThan(0)
  })

  it('应该验证用户凭据', async () => {
    const users = await prisma.sysUser.findMany({
      where: { username: { startsWith: 'testuser_mgmt' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (users.length > 0) {
      const user = await validateUserCredentials(users[0].username, 'testpass123')
      expect(user).not.toBeNull()
    }
  })

  it('应该获取用户角色（初始为空）', async () => {
    const users = await prisma.sysUser.findMany({
      where: { username: { startsWith: 'testuser_mgmt' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (users.length > 0) {
      const roles = await getUserRoles(users[0].id)
      expect(Array.isArray(roles)).toBe(true)
    }
  })

  it('应该获取用户权限（初始为空）', async () => {
    const users = await prisma.sysUser.findMany({
      where: { username: { startsWith: 'testuser_mgmt' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (users.length > 0) {
      const permissions = await getUserPermissions(users[0].id)
      expect(Array.isArray(permissions)).toBe(true)
    }
  })
})

describe('数据权限过滤', () => {
  beforeAll(async () => {
    await seedTestKeys()
  })

  it('应该返回 SELF 范围（新用户无额外权限）', async () => {
    const user = await createUser({
      username: `testuser_perm_${Date.now()}`,
      password: 'testpass123',
      realName: '测试权限用户',
    })

    const filter = await getDataPermissionFilter(user.id)
    expect(filter.scope).toBe('SELF')
    expect(filter.userId).toBe(user.id)
  })

  it('应该构建正确的 SELF 范围查询条件', () => {
    const filter = { scope: 'SELF' as const, userId: 'user123' }
    const where = buildBdcWhereClause(filter)
    expect(where.createdBy).toBe('user123')
  })

  it('应该构建正确的 ALL 范围查询条件', () => {
    const filter = { scope: 'ALL' as const }
    const where = buildBdcWhereClause(filter)
    expect(Object.keys(where)).toHaveLength(0)
  })

  it('应该构建正确的 VILLAGE 范围查询条件', () => {
    const filter = { scope: 'VILLAGE' as const, villageIds: ['village1', 'village2'] }
    const where = buildBdcWhereClause(filter)
    expect(where.villageId).toEqual({ in: ['village1', 'village2'] })
  })
})
