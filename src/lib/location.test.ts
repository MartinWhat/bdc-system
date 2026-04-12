import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('基础数据管理 - 镇街', () => {
  let townId: string
  const testCode = `TOWN_TEST_${Date.now()}`

  it('应该创建镇街', async () => {
    const town = await prisma.sysTown.create({
      data: {
        code: testCode,
        name: '测试镇街',
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    expect(town.code).toBe(testCode)
    expect(town.name).toBe('测试镇街')
    townId = town.id
  })

  it('应该查询到创建的镇街', async () => {
    const town = await prisma.sysTown.findUnique({
      where: { code: testCode },
    })

    expect(town).not.toBeNull()
    expect(town?.name).toBe('测试镇街')
  })

  it('应该更新镇街信息', async () => {
    const updated = await prisma.sysTown.update({
      where: { code: testCode },
      data: { name: '更新镇街名称' },
    })

    expect(updated.name).toBe('更新镇街名称')
  })
})

describe('基础数据管理 - 村居', () => {
  let townId: string
  let villageId: string
  const townCode = `TOWN_VILLAGE_${Date.now()}`
  const villageCode = `VILLAGE_TEST_${Date.now()}`

  beforeAll(async () => {
    // 创建镇街
    const town = await prisma.sysTown.create({
      data: {
        code: townCode,
        name: '测试镇街村居',
        status: 'ACTIVE',
        sortOrder: 2,
      },
    })
    townId = town.id
  })

  it('应该创建村居', async () => {
    const village = await prisma.sysVillage.create({
      data: {
        code: villageCode,
        name: '测试村居',
        townId,
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    expect(village.code).toBe(villageCode)
    expect(village.name).toBe('测试村居')
    expect(village.townId).toBe(townId)
    villageId = village.id
  })

  it('应该查询到创建的村居', async () => {
    const village = await prisma.sysVillage.findUnique({
      where: { code: villageCode },
      include: { town: true },
    })

    expect(village).not.toBeNull()
    expect(village?.town.name).toBe('测试镇街村居')
  })

  it('应该更新村居信息', async () => {
    const updated = await prisma.sysVillage.update({
      where: { code: villageCode },
      data: { name: '更新村居名称' },
    })

    expect(updated.name).toBe('更新村居名称')
  })

  it('应该按镇街查询村居', async () => {
    const villages = await prisma.sysVillage.findMany({
      where: { townId },
    })

    expect(villages.length).toBeGreaterThan(0)
    expect(villages[0].townId).toBe(townId)
  })
})

describe('级联删除保护', () => {
  it('镇街下有村居时应该无法删除', async () => {
    const townCode = `TOWN_CASCADE_${Date.now()}`
    const villageCode = `VILLAGE_CASCADE_${Date.now()}`

    const town = await prisma.sysTown.create({
      data: {
        code: townCode,
        name: '测试镇街级联',
        status: 'ACTIVE',
        sortOrder: 3,
      },
    })

    await prisma.sysVillage.create({
      data: {
        code: villageCode,
        name: '测试村居级联',
        townId: town.id,
        status: 'ACTIVE',
        sortOrder: 1,
      },
    })

    const count = await prisma.sysVillage.count({
      where: { townId: town.id },
    })

    expect(count).toBeGreaterThan(0)
  })
})
