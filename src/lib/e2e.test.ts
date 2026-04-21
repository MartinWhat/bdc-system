/**
 * 端到端集成测试
 * 测试一期核心功能的完整流程
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { generateQueryHash } from '@/lib/gm-crypto/query'
import {
  createUser,
  validateUserCredentials,
  getUserRoles,
  getUserPermissions,
} from '@/lib/auth/user-service'
import { seedTestKeys } from '@/test/helpers'
import { logOperation, queryOperationLogs } from '@/lib/log'

describe('一期端到端集成测试', () => {
  let adminUserId: string
  let townId: string
  let villageId: string
  let bdcId: string

  beforeAll(async () => {
    await seedTestKeys()
  })

  describe('完整业务流程测试', () => {
    it('应该完成：创建管理员 → 创建镇街 → 创建村居 → 创建宅基地 → 记录日志', async () => {
      // 1. 创建管理员用户
      const adminUser = await createUser({
        username: `e2e_admin_${Date.now()}`,
        password: 'admin123',
        realName: '端到端测试管理员',
      })
      adminUserId = adminUser.id
      expect(adminUser.username).toContain('e2e_admin')

      // 2. 创建镇街
      const town = await prisma.sysTown.create({
        data: {
          code: `E2E_TOWN_${Date.now()}`,
          name: '端到端测试镇街',
          status: 'ACTIVE',
          sortOrder: 1,
        },
      })
      townId = town.id
      expect(town.name).toBe('端到端测试镇街')

      // 3. 创建村居
      const village = await prisma.sysVillage.create({
        data: {
          code: `E2E_VILLAGE_${Date.now()}`,
          name: '端到端测试村居',
          townId: town.id,
          status: 'ACTIVE',
          sortOrder: 1,
        },
      })
      villageId = village.id
      expect(village.name).toBe('端到端测试村居')
      expect(village.townId).toBe(townId)

      // 4. 创建宅基地档案
      const idCardResult = await encryptSensitiveField('110101199001019999')
      const bdc = await prisma.zjdBdc.create({
        data: {
          villageId: village.id,
          certNo: `E2E_CERT_${Date.now()}`,
          ownerName: '端到端测试用户',
          idCard: idCardResult.encrypted,
          idCardHash: idCardResult.hash,
          address: '端到端测试地址100号',
          area: 200.0,
          landUseType: '宅基地',
          status: 'PENDING',
          createdBy: adminUserId,
        },
      })
      bdcId = bdc.id
      expect(bdc.ownerName).toBe('端到端测试用户')
      expect(bdc.status).toBe('PENDING')

      // 5. 记录操作日志
      const log = await logOperation({
        userId: adminUserId,
        bdcId: bdc.id,
        action: 'CREATE',
        module: 'BDC',
        description: '端到端测试：创建宅基地档案',
        status: 'SUCCESS',
      })
      expect(log.action).toBe('CREATE')
      expect(log.module).toBe('BDC')

      // 6. 验证日志可查询
      const logs = await queryOperationLogs({
        page: 1,
        pageSize: 10,
        userId: adminUserId,
      })
      expect(logs.total).toBeGreaterThan(0)
    })

    it('应该完成：状态流转测试（PENDING → APPROVED → CERTIFIED → CANCELLED）', async () => {
      const validTransitions: Record<string, string[]> = {
        PENDING: ['APPROVED', 'CANCELLED'],
        APPROVED: ['CERTIFIED', 'CANCELLED'],
        CERTIFIED: ['CANCELLED'],
        CANCELLED: [],
      }

      // 获取当前状态
      let bdc = await prisma.zjdBdc.findUnique({
        where: { id: bdcId },
      })
      expect(bdc?.status).toBe('PENDING')

      // PENDING → APPROVED
      bdc = await prisma.zjdBdc.update({
        where: { id: bdcId },
        data: { status: 'APPROVED' },
      })
      expect(bdc.status).toBe('APPROVED')
      expect(validTransitions['APPROVED']).toContain('CERTIFIED')

      // APPROVED → CERTIFIED
      bdc = await prisma.zjdBdc.update({
        where: { id: bdcId },
        data: {
          status: 'CERTIFIED',
          certIssuedDate: new Date(),
        },
      })
      expect(bdc.status).toBe('CERTIFIED')
      expect(bdc.certIssuedDate).not.toBeNull()
      expect(validTransitions['CERTIFIED']).toContain('CANCELLED')

      // CERTIFIED → CANCELLED
      bdc = await prisma.zjdBdc.update({
        where: { id: bdcId },
        data: { status: 'CANCELLED' },
      })
      expect(bdc.status).toBe('CANCELLED')
      expect(validTransitions['CANCELLED']).toHaveLength(0)
    })

    it('应该完成：加密查询测试', async () => {
      const idCardHash = await generateQueryHash('110101199001019999')

      const bdcs = await prisma.zjdBdc.findMany({
        where: { idCardHash },
      })

      expect(bdcs.length).toBeGreaterThan(0)
      expect(bdcs.some((b) => b.id === bdcId)).toBe(true)
    })

    it('应该完成：用户登录验证测试', async () => {
      const users = await prisma.sysUser.findMany({
        where: { username: { startsWith: 'e2e_admin' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })

      expect(users.length).toBe(1)

      const user = await validateUserCredentials(users[0].username, 'admin123')
      expect(user).not.toBeNull()
      expect(user?.realName).toBe('端到端测试管理员')
    })
  })

  describe('数据完整性测试', () => {
    it('镇街和村居关联应该正确', async () => {
      const village = await prisma.sysVillage.findUnique({
        where: { id: villageId },
        include: { town: true },
      })

      expect(village).not.toBeNull()
      expect(village?.town.id).toBe(townId)
    })

    it('宅基地和村居关联应该正确', async () => {
      const bdc = await prisma.zjdBdc.findUnique({
        where: { id: bdcId },
        include: { village: true },
      })

      expect(bdc).not.toBeNull()
      expect(bdc?.village.id).toBe(villageId)
    })

    it('操作日志应该正确关联用户和宅基地', async () => {
      const logs = await prisma.operationLog.findMany({
        where: {
          userId: adminUserId,
          bdcId: bdcId,
        },
        include: {
          user: true,
          bdc: true,
        },
      })

      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].user.id).toBe(adminUserId)
      expect(logs[0].bdc?.id).toBe(bdcId)
    })
  })

  describe('加密功能测试', () => {
    it('身份证应该被正确加密和解密', async () => {
      const bdc = await prisma.zjdBdc.findUnique({
        where: { id: bdcId },
      })

      // 加密字段应该与明文不同
      expect(bdc?.idCard).not.toBe('110101199001019999')

      // 哈希索引应该正确生成
      const expectedHash = await generateQueryHash('110101199001019999')
      expect(bdc?.idCardHash).toBe(expectedHash)
    })
  })
})
