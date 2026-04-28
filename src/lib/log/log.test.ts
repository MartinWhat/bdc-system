import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { logOperation, queryOperationLogs, getOperationLogStats, cleanupOldLogs } from '@/lib/log'
import { createLogMiddleware, LogMiddleware } from '@/lib/middleware/log'
import { seedTestKeys } from '@/test/helpers'

describe('操作日志服务', () => {
  let userId: string
  let bdcId: string

  beforeAll(async () => {
    await seedTestKeys()

    // 创建测试用户
    const user = await prisma.sysUser.create({
      data: {
        username: `log_test_user_${Date.now()}`,
        passwordHash: 'testhash',
        realName: '日志测试用户',
        status: 'ACTIVE',
        createdBy: 'system',
      },
    })
    userId = user.id

    // 创建测试镇街和村居
    const town = await prisma.sysTown.create({
      data: {
        code: `TOWN_LOG_${Date.now()}`,
        name: '日志测试镇街',
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    const village = await prisma.sysVillage.create({
      data: {
        code: `VILLAGE_LOG_${Date.now()}`,
        name: '日志测试村居',
        townId: town.id,
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    // 创建测试宅基地
    const bdc = await prisma.zjdBdc.create({
      data: {
        villageId: village.id,
        certNo: `CERT_LOG_${Date.now()}`,
        ownerName: '日志测试',
        idCard: 'test_encrypted',
        idCardHash: 'test_hash',
        address: '测试地址',
        area: 100,
        landUseType: '宅基地',
        status: 'PENDING',
        createdBy: userId,
      },
    })
    bdcId = bdc.id
  })

  it('应该记录操作日志', async () => {
    const log = await logOperation({
      userId,
      bdcId,
      action: 'CREATE',
      module: 'BDC',
      description: '创建宅基地档案',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      status: 'SUCCESS',
    })

    expect(log.action).toBe('CREATE')
    expect(log.module).toBe('BDC')
    expect(log.userId).toBe(userId)
  })

  it('应该查询操作日志列表', async () => {
    const result = await queryOperationLogs({
      page: 1,
      pageSize: 10,
      userId,
    })

    expect(result.list.length).toBeGreaterThan(0)
    expect(result.total).toBeGreaterThan(0)
  })

  it('应该按模块过滤日志', async () => {
    const result = await queryOperationLogs({
      page: 1,
      pageSize: 10,
      module: 'BDC',
    })

    expect(result.list.every((log) => log.module === 'BDC')).toBe(true)
  })

  it('应该按状态过滤日志', async () => {
    const result = await queryOperationLogs({
      page: 1,
      pageSize: 10,
      status: 'SUCCESS',
    })

    expect(result.list.every((log) => log.status === 'SUCCESS')).toBe(true)
  })

  it('应该获取日志统计', async () => {
    const stats = await getOperationLogStats(7)

    expect(stats.totalLogs).toBeGreaterThan(0)
    expect(stats.successLogs).toBeGreaterThanOrEqual(0)
    expect(stats.failedLogs).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(stats.moduleStats)).toBe(true)
  })

  it('应该清理过期日志', async () => {
    const count = await cleanupOldLogs(180)
    expect(typeof count).toBe('number')
  })
})

describe('日志中间件', () => {
  let testUserId: string

  beforeAll(async () => {
    await seedTestKeys()

    // 创建测试用户
    const user = await prisma.sysUser.create({
      data: {
        username: `log_middleware_user_${Date.now()}`,
        passwordHash: 'testhash',
        realName: '日志中间件测试用户',
        status: 'ACTIVE',
        createdBy: 'system',
      },
    })
    testUserId = user.id
  })

  it('应该创建日志中间件', async () => {
    const middleware = createLogMiddleware({
      module: 'TEST',
    })

    // 不应该抛出错误
    await expect(
      middleware(testUserId, 'POST', '/api/test', 'SUCCESS', '测试操作'),
    ).resolves.not.toThrow()
  })

  it('应该使用预定义的操作映射', async () => {
    const middleware = LogMiddleware.bdc

    await expect(
      middleware(testUserId, 'POST', '/api/bdc', 'SUCCESS', '创建宅基地'),
    ).resolves.not.toThrow()
  })

  it('应该记录认证操作', async () => {
    const middleware = LogMiddleware.auth

    await expect(
      middleware(testUserId, 'POST', '/api/login', 'SUCCESS', '用户登录'),
    ).resolves.not.toThrow()
  })
})
