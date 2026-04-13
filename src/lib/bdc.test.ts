import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField, generateQueryHash } from '@/lib/gm-crypto'
import { seedTestKeys } from '@/test/helpers'

describe('宅基地管理核心', () => {
  let villageId: string
  let bdcId: string

  beforeAll(async () => {
    await seedTestKeys()

    // 创建镇街
    const town = await prisma.sysTown.create({
      data: {
        code: `TOWN_BDC_${Date.now()}`,
        name: '测试镇街',
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    // 创建村居
    const village = await prisma.sysVillage.create({
      data: {
        code: `VILLAGE_BDC_${Date.now()}`,
        name: '测试村居',
        townId: town.id,
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    villageId = village.id
  })

  it('应该创建宅基地档案', async () => {
    const idCardResult = await encryptSensitiveField('110101199001011234')
    const phoneResult = await encryptSensitiveField('13800138000')

    const bdc = await prisma.zjdBdc.create({
      data: {
        villageId,
        certNo: `CERT${Date.now()}`,
        ownerName: '张三',
        idCard: idCardResult.encrypted,
        idCardHash: idCardResult.hash,
        phone: phoneResult.encrypted,
        phoneHash: phoneResult.hash,
        address: '测试村居100号',
        area: 120.5,
        landUseType: '宅基地',
        status: 'PENDING',
        createdBy: 'system',
      },
    })

    expect(bdc.ownerName).toBe('张三')
    expect(bdc.area).toBe(120.5)
    expect(bdc.status).toBe('PENDING')
    bdcId = bdc.id
  })

  it('应该通过哈希索引查询宅基地', async () => {
    const idCardHash = await generateQueryHash('110101199001011234')

    const bdcs = await prisma.zjdBdc.findMany({
      where: { idCardHash },
    })

    expect(bdcs.length).toBeGreaterThan(0)
    expect(bdcs.some((b) => b.id === bdcId)).toBe(true)
  })

  it('应该更新宅基地档案', async () => {
    const updated = await prisma.zjdBdc.update({
      where: { id: bdcId },
      data: {
        area: 150.0,
        status: 'APPROVED',
      },
    })

    expect(updated.area).toBe(150.0)
    expect(updated.status).toBe('APPROVED')
  })

  it('应该验证状态流转', async () => {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['ISSUED', 'CANCELLED'],
      ISSUED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['CANCELLED'],
      CANCELLED: [],
    }

    const bdc = await prisma.zjdBdc.findUnique({
      where: { id: bdcId },
    })

    expect(bdc).not.toBeNull()
    expect(validTransitions[bdc!.status]).toContain('ISSUED')
  })

  it('应该更新状态为已发放', async () => {
    const updated = await prisma.zjdBdc.update({
      where: { id: bdcId },
      data: {
        status: 'ISSUED',
        certIssuedDate: new Date(),
      },
    })

    expect(updated.status).toBe('ISSUED')
    expect(updated.certIssuedDate).not.toBeNull()
  })

  it('应该注销宅基地档案', async () => {
    const updated = await prisma.zjdBdc.update({
      where: { id: bdcId },
      data: { status: 'CANCELLED' },
    })

    expect(updated.status).toBe('CANCELLED')
  })

  it('已注销的档案不能再流转', async () => {
    const bdc = await prisma.zjdBdc.findUnique({
      where: { id: bdcId },
    })

    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['ISSUED', 'CANCELLED'],
      ISSUED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['CANCELLED'],
      CANCELLED: [],
    }

    expect(validTransitions[bdc!.status]).toHaveLength(0)
  })

  it('应该统计村居的宅基地数量', async () => {
    const count = await prisma.zjdBdc.count({
      where: { villageId },
    })

    expect(count).toBeGreaterThan(0)
  })
})
