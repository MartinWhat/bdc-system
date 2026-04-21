import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { encryptSensitiveField } from '@/lib/gm-crypto'
import { generateQueryHash } from '@/lib/gm-crypto/query'
import { seedTestKeys } from '@/test/helpers'

describe('村集体所有权证书管理', () => {
  let villageId: string
  let certId: string

  beforeAll(async () => {
    await seedTestKeys()

    // 创建镇街
    const town = await prisma.sysTown.create({
      data: {
        code: `TOWN_COLL_${Date.now()}`,
        name: '测试镇街集体',
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    // 创建村居
    const village = await prisma.sysVillage.create({
      data: {
        code: `VILLAGE_COLL_${Date.now()}`,
        name: '测试村居集体',
        townId: town.id,
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    villageId = village.id
  })

  it('应该创建村集体证书（入库申请）', async () => {
    const idCardResult = await encryptSensitiveField('110101199001011234')
    const phoneResult = await encryptSensitiveField('13800138000')

    const cert = await prisma.collectiveCert.create({
      data: {
        certNo: `COLL${Date.now()}`,
        ownerName: '测试村村民委员会',
        ownerType: 'VILLAGE_COLLECTIVE',
        villageId,
        idCard: idCardResult.encrypted,
        idCardHash: idCardResult.hash,
        phone: phoneResult.encrypted,
        phoneHash: phoneResult.hash,
        address: '测试村集体土地',
        area: 5000.0,
        landUseType: '集体建设用地',
        status: 'PENDING_APPROVE',
        stockBy: 'system',
        createdBy: 'system',
      },
    })

    expect(cert.ownerName).toBe('测试村村民委员会')
    expect(cert.ownerType).toBe('VILLAGE_COLLECTIVE')
    expect(cert.area).toBe(5000.0)
    expect(cert.status).toBe('PENDING_APPROVE')
    certId = cert.id
  })

  it('应该创建入库申请操作记录', async () => {
    const operation = await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'STOCK_APPLY',
        operatorId: 'system',
        operatorName: '系统',
        description: '提交入库申请',
      },
    })

    expect(operation.operationType).toBe('STOCK_APPLY')
    expect(operation.certId).toBe(certId)
  })

  it('应该审核通过入库申请', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'IN_STOCK',
        approveBy: 'admin',
        approveAt: new Date(),
        approveRemark: '审核通过',
        stockAt: new Date(),
      },
    })

    expect(updated.status).toBe('IN_STOCK')
    expect(updated.approveBy).toBe('admin')

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'STOCK_APPROVE',
        operatorId: 'admin',
        operatorName: '管理员',
        description: '入库审核通过',
      },
    })
  })

  it('应该验证证书状态机', async () => {
    const validTransitions: Record<string, string[]> = {
      PENDING_APPROVE: ['IN_STOCK', 'CANCELLED'],
      IN_STOCK: ['OUT_STOCK', 'FROZEN', 'CANCELLED'],
      OUT_STOCK: ['IN_STOCK', 'RETURNED'],
      RETURNED: ['IN_STOCK'],
      CANCELLED: [],
      FROZEN: ['IN_STOCK'],
    }

    const cert = await prisma.collectiveCert.findUnique({
      where: { id: certId },
    })

    expect(cert).not.toBeNull()
    expect(validTransitions[cert!.status]).toContain('OUT_STOCK')
  })

  it('应该申请出库', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'OUT_STOCK',
        outBy: 'operator',
        outAt: new Date(),
        outReason: '办理业务需要',
        expectedReturnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    expect(updated.status).toBe('OUT_STOCK')
    expect(updated.outReason).toBe('办理业务需要')

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'OUT_APPLY',
        operatorId: 'operator',
        operatorName: '操作员',
        description: '申请出库',
      },
    })
  })

  it('应该归还证书', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'IN_STOCK',
        returnBy: 'operator',
        returnAt: new Date(),
        returnRemark: '业务办理完成，归还证书',
        actualReturnDate: new Date(),
      },
    })

    expect(updated.status).toBe('IN_STOCK')
    expect(updated.returnBy).toBe('operator')

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'RETURN',
        operatorId: 'operator',
        operatorName: '操作员',
        description: '归还证书',
      },
    })
  })

  it('应该冻结证书', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'FROZEN',
        isFrozen: true,
        freezeReason: '涉嫌纠纷，暂停办理',
        freezeBy: 'admin',
        freezeAt: new Date(),
      },
    })

    expect(updated.status).toBe('FROZEN')
    expect(updated.isFrozen).toBe(true)

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'FREEZE',
        operatorId: 'admin',
        operatorName: '管理员',
        description: '冻结证书',
      },
    })
  })

  it('应该解冻证书', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'IN_STOCK',
        isFrozen: false,
        freezeReason: null,
        freezeBy: null,
        freezeAt: null,
      },
    })

    expect(updated.status).toBe('IN_STOCK')
    expect(updated.isFrozen).toBe(false)

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'UNFREEZE',
        operatorId: 'admin',
        operatorName: '管理员',
        description: '解冻证书',
      },
    })
  })

  it('应该注销证书', async () => {
    const updated = await prisma.collectiveCert.update({
      where: { id: certId },
      data: {
        status: 'CANCELLED',
        cancelBy: 'admin',
        cancelAt: new Date(),
        cancelReason: '证书已失效',
      },
    })

    expect(updated.status).toBe('CANCELLED')

    await prisma.certOperation.create({
      data: {
        certId,
        operationType: 'CANCEL',
        operatorId: 'admin',
        operatorName: '管理员',
        description: '注销证书',
      },
    })
  })

  it('已注销的证书不能再流转', async () => {
    const cert = await prisma.collectiveCert.findUnique({
      where: { id: certId },
    })

    const validTransitions: Record<string, string[]> = {
      CANCELLED: [],
    }

    expect(validTransitions[cert!.status]).toHaveLength(0)
  })

  it('应该通过哈希索引查询证书', async () => {
    const idCardHash = await generateQueryHash('110101199001011234')

    const certs = await prisma.collectiveCert.findMany({
      where: { idCardHash },
    })

    expect(certs.length).toBeGreaterThan(0)
  })

  it('应该统计村居的证书数量', async () => {
    const count = await prisma.collectiveCert.count({
      where: { villageId },
    })

    expect(count).toBeGreaterThan(0)
  })

  it('应该按状态统计证书数量', async () => {
    const statusCounts = await prisma.collectiveCert.groupBy({
      by: ['status'],
      where: { villageId },
      _count: true,
    })

    expect(statusCounts.length).toBeGreaterThan(0)
    expect(statusCounts.some((s) => s.status === 'CANCELLED')).toBe(true)
  })

  it('应该查询证书操作记录', async () => {
    const operations = await prisma.certOperation.findMany({
      where: { certId },
      orderBy: { createdAt: 'desc' },
    })

    expect(operations.length).toBeGreaterThan(0)
    // 验证完整的操作流程记录
    const operationTypes = operations.map((op) => op.operationType)
    expect(operationTypes).toContain('STOCK_APPLY')
    expect(operationTypes).toContain('STOCK_APPROVE')
    expect(operationTypes).toContain('OUT_APPLY')
    expect(operationTypes).toContain('RETURN')
    expect(operationTypes).toContain('FREEZE')
    expect(operationTypes).toContain('UNFREEZE')
    expect(operationTypes).toContain('CANCEL')
  })

  it('应该验证镇集体类型证书', async () => {
    const townCert = await prisma.collectiveCert.create({
      data: {
        certNo: `TOWN_COLL_${Date.now()}`,
        ownerName: '测试镇集体资产管理委员会',
        ownerType: 'TOWN_COLLECTIVE',
        villageId,
        address: '测试镇集体土地',
        area: 10000.0,
        status: 'PENDING_APPROVE',
        stockBy: 'system',
        createdBy: 'system',
      },
    })

    expect(townCert.ownerType).toBe('TOWN_COLLECTIVE')
  })
})
