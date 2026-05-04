/**
 * 村集体所有权证书假数据生成脚本
 * 使用方法：npx tsx scripts/seed-collective.ts
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { encryptSensitiveField } from '../src/lib/gm-crypto'

// 假数据配置
const TOWNS = [
  { code: 'TOWN001', name: '城关镇' },
  { code: 'TOWN002', name: '东山镇' },
  { code: 'TOWN003', name: '西湖镇' },
  { code: 'TOWN004', name: '南山镇' },
  { code: 'TOWN005', name: '北岭镇' },
]

const VILLAGES = [
  { code: 'VILLAGE001', name: '和平村村民委员会', townIndex: 0 },
  { code: 'VILLAGE002', name: '建设村村民委员会', townIndex: 0 },
  { code: 'VILLAGE003', name: '胜利村村民委员会', townIndex: 1 },
  { code: 'VILLAGE004', name: '幸福村村民委员会', townIndex: 1 },
  { code: 'VILLAGE005', name: '光明村村民委员会', townIndex: 2 },
  { code: 'VILLAGE006', name: '红星村村民委员会', townIndex: 2 },
  { code: 'VILLAGE007', name: '前进村村民委员会', townIndex: 3 },
  { code: 'VILLAGE008', name: '东风村村民委员会', townIndex: 3 },
  { code: 'VILLAGE009', name: '东方红村村民委员会', townIndex: 4 },
  { code: 'VILLAGE010', name: '红旗村村民委员会', townIndex: 4 },
]

const OWNER_TYPES = ['VILLAGE_COLLECTIVE', 'TOWN_COLLECTIVE']

const LAND_USE_TYPES = ['集体建设用地', '农用地', '林地', '草地', '农田水利用地', '养殖水面']

const STATUSES = ['IN_STOCK', 'OUT_STOCK', 'PENDING_APPROVE', 'RETURNED', 'FROZEN'] as const

const ID_CARDS = [
  '110101199001011234',
  '110102198502022345',
  '110103197803033456',
  '110104199204044567',
  '110105198805055678',
]

const PHONES = ['13800138000', '13900139000', '13700137000', '13600136000', '13500135000']

const ADDRESSES = [
  'XX 镇 XX 村第 1 村民小组',
  'XX 镇 XX 村第 2 村民小组',
  'XX 镇 XX 村第 3 村民小组',
  'XX 镇 XX 村村委会大院',
  'XX 镇 XX 村文化中心',
]

// 示例附件数据（JSON 数组，undefined 表示无附件）
const SAMPLE_ATTACHMENTS = [
  [{ name: '权属证明.pdf', url: '/uploads/attachments/sample1.pdf' }],
  [{ name: '土地使用证.pdf', url: '/uploads/attachments/sample2.pdf' }],
  undefined, // 无附件
]

// 生成随机数
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 生成随机选择
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// 生成证书编号
function generateCertNo(index: number): string {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  return `COLL${year}${month}${String(index).padStart(4, '0')}`
}

// 生成随机日期（过去 1-3 年）
function generatePastDate(daysAgo: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date
}

// 生成未来日期
function generateFutureDate(daysAhead: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + daysAhead)
  return date
}

async function seedCollectiveCerts(count: number = 20) {
  console.log('🌱 开始生成村集体所有权证书假数据...\n')

  // 先创建镇街
  console.log('📍 创建镇街数据...')
  const createdTowns = []
  for (const town of TOWNS) {
    const created = await prisma.sysTown.upsert({
      where: { code: town.code },
      update: {},
      create: {
        code: town.code,
        name: town.name,
        status: 'ACTIVE',
        sortOrder: randomInt(1, 10),
      },
    })
    createdTowns.push(created)
    console.log(`  ✅ ${town.name}`)
  }

  // 再创建村居
  console.log('\n📍 创建村居数据...')
  const createdVillages = []
  for (const village of VILLAGES) {
    const town = createdTowns[village.townIndex]
    const created = await prisma.sysVillage.upsert({
      where: { code: village.code },
      update: {},
      create: {
        code: village.code,
        name: village.name,
        townId: town.id,
        status: 'ACTIVE',
        sortOrder: randomInt(1, 10),
      },
    })
    createdVillages.push(created)
    console.log(`  ✅ ${village.name} (${town.name})`)
  }

  // 获取系统用户
  console.log('\n👤 获取系统用户...')
  const systemUser = await prisma.sysUser.findFirst({
    where: { username: 'system' },
  })
  const userId = systemUser?.id || 'system'
  console.log(`  ✅ 使用用户：${systemUser?.realName || systemUser?.username || 'system'}`)

  // 创建证书
  console.log(`\n📜 创建 ${count} 条村集体证书数据...`)
  const statusDistribution = {
    IN_STOCK: Math.floor(count * 0.5), // 50% 在库
    OUT_STOCK: Math.floor(count * 0.2), // 20% 已出库
    PENDING_APPROVE: Math.floor(count * 0.15), // 15% 待审核
    RETURNED: Math.floor(count * 0.1), // 10% 已归还
    FROZEN: Math.floor(count * 0.05), // 5% 已冻结
  }

  let certIndex = 1
  for (const [status, statusCount] of Object.entries(statusDistribution)) {
    for (let i = 0; i < statusCount; i++) {
      const village = randomChoice(createdVillages)
      const ownerType = randomChoice(OWNER_TYPES)
      const certNo = generateCertNo(certIndex++)

      const idCard = randomChoice(ID_CARDS)
      const phone = randomChoice(PHONES)

      // 加密敏感信息
      const idCardResult = await encryptSensitiveField(idCard)
      const phoneResult = await encryptSensitiveField(phone)

      const certData = {
        certNo,
        ownerName: village.name,
        ownerType,
        villageId: village.id,
        idCard: idCardResult.encrypted,
        idCardHash: idCardResult.hash,
        phone: phoneResult.encrypted,
        phoneHash: phoneResult.hash,
        address: randomChoice(ADDRESSES),
        area: randomInt(1000, 10000) + Math.random() * 100,
        landUseType: randomChoice(LAND_USE_TYPES),
        certIssueDate: generatePastDate(randomInt(100, 1000)),
        certExpiryDate: generateFutureDate(randomInt(100, 1000)),
        attachments: randomChoice(SAMPLE_ATTACHMENTS),
        status: status as any,
        isFrozen: status === 'FROZEN',
        freezeReason: status === 'FROZEN' ? '权属争议' : null,
        freezeBy: status === 'FROZEN' ? userId : null,
        freezeAt: status === 'FROZEN' ? generatePastDate(randomInt(1, 30)) : null,
        stockBy: status !== 'PENDING_APPROVE' ? userId : null,
        stockAt: status !== 'PENDING_APPROVE' ? generatePastDate(randomInt(10, 100)) : null,
        stockRemark: status !== 'PENDING_APPROVE' ? '批量导入' : null,
        approveBy: status !== 'PENDING_APPROVE' ? userId : null,
        approveAt: status !== 'PENDING_APPROVE' ? generatePastDate(randomInt(5, 50)) : null,
        approveRemark: status !== 'PENDING_APPROVE' ? '审核通过' : null,
        createdBy: userId,
      }

      // 出库相关字段
      if (status === 'OUT_STOCK') {
        Object.assign(certData, {
          outBy: userId,
          outAt: generatePastDate(randomInt(5, 30)),
          outReason: '业务办理需要',
          outApproveBy: userId,
          outApproveAt: generatePastDate(randomInt(5, 30)),
          outApproveRemark: '同意出库',
          expectedReturnDate: generateFutureDate(randomInt(10, 60)),
        })
      }

      // 归还相关字段
      if (status === 'RETURNED') {
        Object.assign(certData, {
          outBy: userId,
          outAt: generatePastDate(randomInt(30, 100)),
          outReason: '业务办理需要',
          outApproveBy: userId,
          outApproveAt: generatePastDate(randomInt(30, 100)),
          expectedReturnDate: generatePastDate(randomInt(10, 30)),
          actualReturnDate: generatePastDate(randomInt(5, 20)),
          returnBy: userId,
          returnAt: generatePastDate(randomInt(5, 20)),
          returnRemark: '已归还',
        })
      }

      await prisma.collectiveCert.create({ data: certData })
      console.log(`  ✅ ${certNo} - ${village.name} (${status})`)
    }
  }

  // 统计结果
  console.log('\n📊 数据统计:')
  const total = await prisma.collectiveCert.count()
  const byStatus = await prisma.collectiveCert.groupBy({
    by: ['status'],
    _count: true,
  })
  const byOwnerType = await prisma.collectiveCert.groupBy({
    by: ['ownerType'],
    _count: true,
  })

  console.log(`  总计：${total} 条`)
  console.log('  按状态:')
  byStatus.forEach((s: any) => {
    console.log(`    - ${s.status}: ${s._count} 条`)
  })
  console.log('  按类型:')
  byOwnerType.forEach((t: any) => {
    console.log(`    - ${t.ownerType}: ${t._count} 条`)
  })

  console.log('\n✅ 假数据生成完成！\n')
}

// 执行
seedCollectiveCerts(20)
  .catch((error) => {
    console.error('❌ 错误:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
