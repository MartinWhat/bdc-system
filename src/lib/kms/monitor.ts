/**
 * 密钥监控和告警模块
 * 负责密钥状态监控、过期提醒、解密失败统计等
 */

import { prisma } from '@/lib/prisma'
import { getActiveKey, getAllKeys, isKeyExpired, KEY_ROTATION_DAYS, type KeyType } from '@/lib/kms'

/**
 * 密钥状态报告
 */
export interface KeyStatusReport {
  keyType: KeyType
  activeKey: {
    id: string
    version: number
    expiresAt: Date
    daysUntilExpiry: number
  }
  historicalKeys: number
  archivedKeys: number
  totalEncryptedData: number
}

/**
 * 告警信息
 */
export interface Alert {
  level: 'info' | 'warning' | 'critical'
  type: 'expiring_soon' | 'expired' | 'rotation_needed' | 'decryption_failed'
  message: string
  keyId?: string
  keyType?: KeyType
  timestamp: Date
}

/**
 * 检查密钥状态并生成报告
 */
export async function generateKeyStatusReport(): Promise<KeyStatusReport[]> {
  const reports: KeyStatusReport[] = []
  const keyTypes: KeyType[] = ['MASTER_KEY', 'SM4_DATA', 'SM2_SIGN', 'JWT_SECRET']

  for (const keyType of keyTypes) {
    try {
      // 获取活跃密钥
      const activeKey = await getActiveKey(keyType, false)

      // 计算距离过期的天数
      const now = new Date()
      const daysUntilExpiry = Math.ceil(
        (activeKey.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )

      // 获取历史密钥数量
      const allKeys = await getAllKeys(keyType, true)
      const historicalKeys = allKeys.filter((k) => !k.isActive && !k.isArchived).length
      const archivedKeys = allKeys.filter((k) => k.isArchived).length

      // 统计加密数据总数
      const totalEncryptedData = allKeys.reduce((sum, k) => sum + (k.encryptedDataCount || 0), 0)

      reports.push({
        keyType,
        activeKey: {
          id: activeKey.id,
          version: activeKey.version,
          expiresAt: activeKey.expiresAt,
          daysUntilExpiry: daysUntilExpiry,
        },
        historicalKeys,
        archivedKeys,
        totalEncryptedData,
      })
    } catch (error) {
      console.error(`Failed to get status for ${keyType}:`, error)
    }
  }

  return reports
}

/**
 * 检查并生成告警
 */
export async function checkAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const now = new Date()

  const reports = await generateKeyStatusReport()

  for (const report of reports) {
    const { keyType, activeKey } = report

    // 检查是否已过期
    if (activeKey.daysUntilExpiry < 0) {
      alerts.push({
        level: 'critical',
        type: 'expired',
        message: `密钥 ${keyType} 已过期 ${Math.abs(activeKey.daysUntilExpiry)} 天`,
        keyType,
        keyId: activeKey.id,
        timestamp: now,
      })
    }
    // 检查是否即将过期（提前 7 天告警）
    else if (activeKey.daysUntilExpiry <= 7) {
      alerts.push({
        level: 'warning',
        type: 'expiring_soon',
        message: `密钥 ${keyType} 将在 ${activeKey.daysUntilExpiry} 天后过期`,
        keyType,
        keyId: activeKey.id,
        timestamp: now,
      })
    }
    // 检查是否需要轮换（达到轮换周期的 80%）
    const rotationDays = KEY_ROTATION_DAYS[keyType]
    const daysSinceCreation = Math.ceil(
      (now.getTime() - activeKey.expiresAt.getTime()) / (1000 * 60 * 60 * 24) + rotationDays,
    )

    if (daysSinceCreation >= rotationDays * 0.8) {
      alerts.push({
        level: 'info',
        type: 'rotation_needed',
        message: `密钥 ${keyType} 已使用 ${daysSinceCreation}/${rotationDays} 天，建议轮换`,
        keyType,
        keyId: activeKey.id,
        timestamp: now,
      })
    }
  }

  // 检查解密失败统计
  const decryptionFailures = await prisma.operationLog.findMany({
    where: {
      action: 'KEY_DECRYPT',
      status: 'FAILED',
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 过去 24 小时
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  if (decryptionFailures.length > 0) {
    alerts.push({
      level: 'warning',
      type: 'decryption_failed',
      message: `过去 24 小时内发生 ${decryptionFailures.length} 次解密失败`,
      timestamp: now,
    })
  }

  return alerts
}

/**
 * 获取密钥使用统计
 */
export async function getKeyUsageStats() {
  const now = new Date()
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 过去 24 小时的密钥操作
  const operations24h = await prisma.operationLog.count({
    where: {
      module: 'KMS',
      createdAt: { gte: last24Hours },
    },
  })

  // 过去 7 天的密钥操作
  const operations7d = await prisma.operationLog.count({
    where: {
      module: 'KMS',
      createdAt: { gte: last7Days },
    },
  })

  // 解密失败统计
  const decryptFailures24h = await prisma.operationLog.count({
    where: {
      action: 'KEY_DECRYPT',
      status: 'FAILED',
      createdAt: { gte: last24Hours },
    },
  })

  return {
    operations24h,
    operations7d,
    decryptFailures24h,
  }
}

/**
 * 打印监控报告（用于命令行）
 */
export async function printMonitorReport() {
  console.log('🔐 密钥监控报告\n')
  console.log('='.repeat(60))

  const reports = await generateKeyStatusReport()
  const alerts = await checkAlerts()
  const stats = await getKeyUsageStats()

  // 密钥状态
  console.log('\n📊 密钥状态:\n')
  for (const report of reports) {
    console.log(`  ${report.keyType}:`)
    console.log(`    活跃密钥：${report.activeKey.id} (v${report.activeKey.version})`)
    console.log(`    过期时间：${report.activeKey.expiresAt.toISOString()}`)
    console.log(`    剩余天数：${report.activeKey.daysUntilExpiry} 天`)
    console.log(`    历史密钥：${report.historicalKeys} 个`)
    console.log(`    归档密钥：${report.archivedKeys} 个`)
    console.log(`    加密数据：${report.totalEncryptedData} 条`)
    console.log()
  }

  // 告警信息
  if (alerts.length > 0) {
    console.log('⚠️  告警信息:\n')
    for (const alert of alerts) {
      const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵'
      console.log(`  ${icon} [${alert.level.toUpperCase()}] ${alert.message}`)
    }
    console.log()
  } else {
    console.log('✅ 无告警信息\n')
  }

  // 使用统计
  console.log('📈 使用统计:')
  console.log(`  过去 24 小时操作：${stats.operations24h} 次`)
  console.log(`  过去 7 天操作：${stats.operations7d} 次`)
  console.log(`  解密失败 (24h)：${stats.decryptFailures24h} 次`)
  console.log()

  console.log('='.repeat(60))
  console.log('\n✅ 监控报告完成\n')
}

// 命令行执行
async function main() {
  try {
    await printMonitorReport()
  } catch (error) {
    console.error('监控报告生成失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}
