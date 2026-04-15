/**
 * 假数据生成脚本
 * 创建测试用的镇街、村居、宅基地、领证记录等数据
 */

import { prisma } from '@/lib/prisma'
import { hashUserPassword } from '@/lib/auth'
import { encryptSensitiveField, sm3Hash, generateSM4Key } from '@/lib/gm-crypto'
import { getActiveKey } from '@/lib/kms'
import { sm3Hmac } from '@/lib/gm-crypto'

// 假数据配置
const TOWNS = [
  { code: '330101001', name: '东湖街道' },
  { code: '330101002', name: '西湖街道' },
  { code: '330101003', name: '南湖街道' },
  { code: '330101004', name: '北干街道' },
  { code: '330101005', name: '城厢街道' },
]

const VILLAGES_PER_TOWN = [
  ['城东村', '城西村', '城南村', '城北村'],
  ['东山村', '西山村', '南山村', '北山村'],
  ['前进村', '胜利村', '光明村', '幸福村'],
  ['和平村', '团结村', '友谊村', '民主村'],
  ['振兴村', '富强村', '小康村', '和谐村'],
]

const OWNER_NAMES = [
  '张三',
  '李四',
  '王五',
  '赵六',
  '钱七',
  '孙八',
  '周九',
  '吴十',
  '郑一',
  '王二',
  '冯三',
  '陈四',
  '褚五',
  '卫六',
  '蒋七',
  '沈八',
  '韩九',
  '杨十',
  '朱一',
  '秦二',
]

const LAND_USE_TYPES = ['宅基地', '农用地', '建设用地', '未利用地']

// 生成假身份证号（仅用于测试）
function generateFakeIdCard(index: number): string {
  const areaCode = '330101'
  const year = 1960 + (index % 40)
  const month = String(1 + (index % 12)).padStart(2, '0')
  const day = String(1 + (index % 28)).padStart(2, '0')
  const seq = String(index % 100).padStart(3, '0')
  const checkDigit = '0123456789X'[index % 11]
  return `${areaCode}${year}${month}${day}${seq}${checkDigit}`
}

// 生成假手机号
function generateFakePhone(index: number): string {
  const prefix = '13'
  const middle = String(5000000 + index * 12345).slice(-8)
  return `${prefix}${middle}`
}

/**
 * 初始化 KMS 密钥
 */
async function initKmsKeys() {
  console.log('初始化 KMS 密钥...')

  const keyTypes: Array<'MASTER_KEY' | 'SM4_DATA' | 'SM2_SIGN' | 'JWT_SECRET'> = [
    'MASTER_KEY',
    'SM4_DATA',
    'SM2_SIGN',
    'JWT_SECRET',
  ]

  // 使用固定的 fallback 密钥（与.env 配置一致）
  const fallbackKey = process.env.KMS_FALLBACK_KEY || '0123456789abcdef0123456789abcdef'

  for (const keyType of keyTypes) {
    // 检查是否已有活跃密钥
    const existing = await prisma.sysKeyVersion.findFirst({
      where: { keyType, isActive: true },
    })

    if (existing) {
      console.log(`  密钥 ${keyType} 已存在，跳过`)
      continue
    }

    // 生成密钥明文
    const keyValue = generateSM4Key()

    // MASTER_KEY 使用 SM3 哈希，其他使用 SM4 加密存储
    let encryptedValue: string
    if (keyType === 'MASTER_KEY') {
      encryptedValue = sm3Hash(keyValue)
    } else {
      // 使用 fallback 密钥加密
      const { sm4Encrypt } = require('@/lib/gm-crypto')
      const iv = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, '0'),
      ).join('')
      const encrypted = sm4Encrypt(keyValue, fallbackKey, iv)
      encryptedValue = `${iv}:${encrypted.ciphertext}`
    }

    // 创建并激活密钥
    await prisma.sysKeyVersion.create({
      data: {
        keyType,
        version: 1,
        keyValue: encryptedValue,
        isActive: true,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdBy: 'system',
      },
    })

    console.log(`  ✓ 初始化密钥：${keyType}`)
  }

  console.log('KMS 密钥初始化完成!\n')
}

/**
 * 创建测试用户
 */
async function createTestUsers() {
  console.log('创建测试用户...')

  const testUsers = [
    { username: 'operator', realName: '操作员' },
    { username: 'viewer', realName: '查看员' },
  ]

  for (const user of testUsers) {
    const existing = await prisma.sysUser.findUnique({
      where: { username: user.username },
    })

    if (existing) {
      console.log(`  跳过已存在用户：${user.username}`)
      continue
    }

    const { passwordHash, salt } = hashUserPassword('password123')
    const created = await prisma.sysUser.create({
      data: {
        username: user.username,
        passwordHash,
        salt,
        realName: user.realName,
        status: 'ACTIVE',
        createdBy: 'system',
      },
    })

    // 分配角色
    const roleCode = user.username === 'operator' ? 'OPERATOR' : 'VIEWER'
    const role = await prisma.sysRole.findUnique({
      where: { code: roleCode },
    })

    if (role) {
      await prisma.userRole.create({
        data: {
          userId: created.id,
          roleId: role.id,
        },
      })
    }

    console.log(`  ✓ 创建用户：${user.username} (密码：password123)`)
  }
}

/**
 * 创建镇街和村居数据
 */
async function createTownsAndVillages() {
  console.log('\n创建镇街和村居数据...')

  for (let i = 0; i < TOWNS.length; i++) {
    const townData = TOWNS[i]

    // 创建镇街
    let town = await prisma.sysTown.findUnique({
      where: { code: townData.code },
    })

    if (!town) {
      town = await prisma.sysTown.create({
        data: {
          code: townData.code,
          name: townData.name,
          status: 'ACTIVE',
          sortOrder: i,
        },
      })
      console.log(`  ✓ 创建镇街：${townData.name}`)
    }

    // 创建村居
    const villages = VILLAGES_PER_TOWN[i]
    for (let j = 0; j < villages.length; j++) {
      const villageCode = `${townData.code}${String(j + 1).padStart(3, '0')}`

      const existing = await prisma.sysVillage.findUnique({
        where: { code: villageCode },
      })

      if (!existing) {
        await prisma.sysVillage.create({
          data: {
            code: villageCode,
            name: villages[j],
            townId: town.id,
            status: 'ACTIVE',
            sortOrder: j,
          },
        })
        console.log(`    ✓ 创建村居：${villages[j]}`)
      }
    }
  }
}

/**
 * 创建宅基地数据
 */
async function createBdcRecords() {
  console.log('\n创建宅基地数据...')

  const villages = await prisma.sysVillage.findMany({
    include: { town: true },
  })

  let createdCount = 0
  let skippedCount = 0

  for (let i = 0; i < 50; i++) {
    const village = villages[i % villages.length]
    const ownerName = OWNER_NAMES[i % OWNER_NAMES.length]
    const certNo = `330101${String(i + 1).padStart(6, '0')}`

    // 检查是否已存在
    const existing = await prisma.zjdBdc.findUnique({
      where: { certNo },
    })

    if (existing) {
      skippedCount++
      continue
    }

    const idCard = generateFakeIdCard(i)
    const phone = generateFakePhone(i)

    // 加密敏感字段
    const idCardResult = await encryptSensitiveField(idCard)
    const phoneResult = await encryptSensitiveField(phone)

    // 生成哈希索引
    const masterKeyRecord = await getActiveKey('MASTER_KEY')
    const idCardHash = sm3Hmac(idCard, masterKeyRecord.keyValue)
    const phoneHash = sm3Hmac(phone, masterKeyRecord.keyValue)

    const statusOptions = ['PENDING', 'APPROVED', 'ISSUED'] as const
    const status = statusOptions[i % 3]

    await prisma.zjdBdc.create({
      data: {
        villageId: village.id,
        certNo,
        ownerName,
        idCard: idCardResult.encrypted,
        idCardHash,
        phone: phoneResult.encrypted,
        phoneHash,
        address: `${village.town.name}${village.name}${i + 1}号`,
        area: 80 + (i % 50) * 2,
        landUseType: LAND_USE_TYPES[i % LAND_USE_TYPES.length],
        status,
        approvedArea: status !== 'PENDING' ? 80 + (i % 50) * 2 : undefined,
        approvedDate: status !== 'PENDING' ? new Date() : undefined,
        certIssuedDate: status === 'ISSUED' ? new Date() : undefined,
        createdBy: 'system',
      },
    })

    createdCount++
  }

  console.log(`  ✓ 创建宅基地：${createdCount} 条，跳过：${skippedCount} 条`)
}

/**
 * 创建领证记录
 */
async function createReceiveRecords() {
  console.log('\n创建领证记录...')

  const issuedBdcs = await prisma.zjdBdc.findMany({
    where: { status: 'ISSUED' },
    include: {
      village: {
        include: { town: true },
      },
    },
  })

  let createdCount = 0

  for (let i = 0; i < Math.min(20, issuedBdcs.length); i++) {
    const bdc = issuedBdcs[i]

    // 检查是否已有领证记录
    const existing = await prisma.zjdReceiveRecord.findFirst({
      where: { bdcId: bdc.id },
    })

    if (existing) {
      continue
    }

    const statusOptions = ['PENDING', 'ISSUED', 'COMPLETED'] as const
    const status = statusOptions[i % 3]

    const record = await prisma.zjdReceiveRecord.create({
      data: {
        bdcId: bdc.id,
        status,
        applyDate: new Date(Date.now() - i * 86400000), // 递减日期
        issueDate: status !== 'PENDING' ? new Date() : undefined,
        receiveDate: status === 'COMPLETED' ? new Date() : undefined,
        createdBy: 'system',
      },
      include: {
        bdc: true,
      },
    })

    // 创建流程节点
    await prisma.processNode.create({
      data: {
        receiveRecordId: record.id,
        nodeType: 'IMPORT',
        nodeName: '批量导入',
        operatorId: 'system',
        operatorName: '系统',
        description: `批量导入证书编号：${bdc.certNo}`,
      },
    })

    if (status !== 'PENDING') {
      await prisma.processNode.create({
        data: {
          receiveRecordId: record.id,
          nodeType: 'ISSUE',
          nodeName: '证书发放',
          operatorId: 'system',
          operatorName: '系统',
          description: '证书已发放给领取人',
        },
      })
    }

    if (status === 'COMPLETED') {
      // 更新领取人信息
      const receiverIdCard = generateFakeIdCard(100 + i)
      const receiverPhone = generateFakePhone(100 + i)
      const idCardResult = await encryptSensitiveField(receiverIdCard)
      const phoneResult = await encryptSensitiveField(receiverPhone)

      // 获取主密钥用于生成哈希
      const masterKeyRecord = await getActiveKey('MASTER_KEY')
      const receiverIdCardHash = sm3Hmac(receiverIdCard, masterKeyRecord.keyValue)
      const receiverPhoneHash = sm3Hmac(receiverPhone, masterKeyRecord.keyValue)

      await prisma.zjdReceiveRecord.update({
        where: { id: record.id },
        data: {
          receiverName: OWNER_NAMES[i % OWNER_NAMES.length],
          receiverIdCard: idCardResult.encrypted,
          receiverIdCardHash,
          receiverPhone: phoneResult.encrypted,
          receiverPhoneHash,
          signedBy: OWNER_NAMES[i % OWNER_NAMES.length],
          signedDate: new Date(),
        },
      })

      await prisma.processNode.create({
        data: {
          receiveRecordId: record.id,
          nodeType: 'COMPLETE',
          nodeName: '领取完成',
          operatorId: 'system',
          operatorName: '系统',
          description: `领取人：${OWNER_NAMES[i % OWNER_NAMES.length]}`,
        },
      })
    }

    createdCount++
  }

  console.log(`  ✓ 创建领证记录：${createdCount} 条`)
}

/**
 * 创建异议记录
 */
async function createObjectionRecords() {
  console.log('\n创建异议记录...')

  const issuedRecords = await prisma.zjdReceiveRecord.findMany({
    where: { status: 'ISSUED' },
    take: 3,
  })

  const objectionTypes = ['NAME_ERROR', 'ID_CARD_ERROR', 'AREA_ERROR', 'OTHER'] as const
  const descriptions = [
    '权利人姓名与身份证不符',
    '身份证号码录入错误',
    '面积数据有误，实际面积与登记不符',
    '其他异议事项',
  ]

  let createdCount = 0

  for (let i = 0; i < issuedRecords.length; i++) {
    const record = issuedRecords[i]

    // 检查是否已有异议
    const existing = await prisma.objection.findFirst({
      where: { receiveRecordId: record.id },
    })

    if (existing) {
      continue
    }

    const objection = await prisma.objection.create({
      data: {
        receiveRecordId: record.id,
        objectionType: objectionTypes[i % objectionTypes.length],
        description: descriptions[i % descriptions.length],
        status: 'PENDING',
      },
    })

    // 更新领证记录状态为异议中
    await prisma.zjdReceiveRecord.update({
      where: { id: record.id },
      data: { status: 'OBJECTION' },
    })

    await prisma.processNode.create({
      data: {
        receiveRecordId: record.id,
        nodeType: 'OBJECTION',
        nodeName: '登记异议',
        operatorId: 'system',
        operatorName: '系统',
        description: `异议类型：${objectionTypes[i % objectionTypes.length]}, 描述：${descriptions[i % descriptions.length]}`,
      },
    })

    createdCount++
  }

  console.log(`  ✓ 创建异议记录：${createdCount} 条`)
}

/**
 * 运行所有假数据脚本
 */
export async function seedFakeData() {
  console.log('=== 开始生成假数据 ===\n')

  try {
    await initKmsKeys()
    await createTestUsers()
    await createTownsAndVillages()
    await createBdcRecords()
    await createReceiveRecords()
    await createObjectionRecords()

    console.log('\n=== 假数据生成完成！ ===\n')
    console.log('测试账号:')
    console.log('  admin / admin123 (系统管理员)')
    console.log('  operator / password123 (操作员)')
    console.log('  viewer / password123 (查看员)')
  } catch (error) {
    console.error('假数据生成失败:', error)
    throw error
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  seedFakeData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('执行失败:', error)
      process.exit(1)
    })
}
