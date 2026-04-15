/**
 * 密钥清理脚本 - 清理超过保留期的密钥
 *
 * 使用方法：npx tsx scripts/cleanup-expired-keys.ts [retentionDays]
 *
 * 示例：npx tsx scripts/cleanup-expired-keys.ts 365  # 清理 365 天前的密钥
 */

import { prisma } from '@/lib/prisma'
import { getDecryptKeys, archiveKey, deleteKey, KEY_ROTATION_DAYS, type KeyType } from '@/lib/kms'

// 默认保留期（天）
const DEFAULT_RETENTION_DAYS = 365

/**
 * 清理超过保留期的密钥
 * @param retentionDays - 保留期（天）
 */
async function cleanupExpiredKeys(retentionDays: number = DEFAULT_RETENTION_DAYS) {
  console.log(`🔑 开始清理过期密钥...\n`)
  console.log(`   保留期：${retentionDays} 天\n`)

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  let archived = 0
  let deleted = 0
  let skipped = 0

  // 按密钥类型分别处理
  const keyTypes: KeyType[] = ['SM4_DATA', 'JWT_SECRET', 'MASTER_KEY', 'SM2_SIGN']

  for (const keyType of keyTypes) {
    console.log(`📋 处理密钥类型：${keyType}`)

    // 获取该类型的所有密钥
    const allKeys = await prisma.sysKeyVersion.findMany({
      where: {
        keyType,
        isActive: false,
        isArchived: false,
        deletedAt: null,
        updatedAt: { lt: cutoffDate },
      },
      orderBy: { updatedAt: 'asc' },
    })

    console.log(`   找到 ${allKeys.length} 个可清理的密钥`)

    for (const key of allKeys) {
      try {
        // 检查是否还有数据使用该密钥
        if (key.encryptedDataCount && key.encryptedDataCount > 0) {
          console.log(`   ⚠️  跳过 ${key.id}：仍有 ${key.encryptedDataCount} 条数据未迁移`)
          skipped++
          continue
        }

        // 检查是否有迁移目标密钥
        if (!key.migratedToKeyId) {
          console.log(`   ⚠️  跳过 ${key.id}：未指定迁移目标密钥`)
          skipped++
          continue
        }

        // 验证目标密钥是否存在
        const targetKey = await prisma.sysKeyVersion.findUnique({
          where: { id: key.migratedToKeyId },
        })

        if (!targetKey) {
          console.log(`   ⚠️  跳过 ${key.id}：迁移目标密钥不存在`)
          skipped++
          continue
        }

        // 先归档，再删除（安全起见）
        await archiveKey(key.id)
        console.log(`   📦 已归档：${key.id}`)
        archived++

        // 对于某些密钥类型，归档后可以直接删除
        if (keyType === 'JWT_SECRET') {
          // JWT_SECRET 可以直接删除（因为 token 会过期）
          await deleteKey(key.id)
          console.log(`   🗑️  已删除：${key.id}`)
          deleted++
        } else if (keyType === 'SM4_DATA') {
          // SM4_DATA 需要确认数据已迁移
          // 这里我们检查目标密钥的数据计数
          if (
            targetKey.encryptedDataCount &&
            targetKey.encryptedDataCount >= key.encryptedDataCount!
          ) {
            await deleteKey(key.id)
            console.log(`   🗑️  已删除：${key.id}`)
            deleted++
          } else {
            console.log(`   ⏸️  暂缓删除 ${key.id}：数据迁移可能未完成`)
          }
        } else {
          // MASTER_KEY 和 SM2_SIGN 只归档不删除
          console.log(`   🔒 保留 ${key.id}：重要密钥只归档不删除`)
        }
      } catch (error) {
        console.error(`   ❌ 处理 ${key.id} 失败:`, error)
        skipped++
      }
    }

    console.log()
  }

  // 生成报告
  console.log(`\n📊 清理汇总:`)
  console.log(`   归档：${archived} 个`)
  console.log(`   删除：${deleted} 个`)
  console.log(`   跳过：${skipped} 个`)
  console.log(`\n✅ 密钥清理完成！\n`)

  return { archived, deleted, skipped }
}

/**
 * 检查需要轮换的密钥
 */
async function checkKeyRotation() {
  console.log(`🔍 检查需要轮换的密钥...\n`)

  const now = new Date()
  const warningDays = 7 // 提前 7 天告警

  for (const [keyType, days] of Object.entries(KEY_ROTATION_DAYS)) {
    const upcomingExpiry = new Date()
    upcomingExpiry.setDate(upcomingExpiry.getDate() + warningDays)

    const expiringKeys = await prisma.sysKeyVersion.findMany({
      where: {
        keyType: keyType as KeyType,
        isActive: true,
        expiresAt: { lte: upcomingExpiry },
      },
    })

    if (expiringKeys.length > 0) {
      console.log(`⚠️  密钥 ${keyType} 即将过期（${days} 天轮换）:`)
      for (const key of expiringKeys) {
        const daysLeft = Math.ceil(
          (key.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        )
        console.log(`   - ${key.id}: 剩余 ${daysLeft} 天`)
      }
      console.log()
    }
  }
}

// 命令行执行
async function main() {
  const args = process.argv.slice(2)
  const retentionDays = args[0] ? parseInt(args[0]) : DEFAULT_RETENTION_DAYS

  try {
    await checkKeyRotation()
    await cleanupExpiredKeys(retentionDays)
  } catch (error) {
    console.error('清理失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

export { cleanupExpiredKeys, checkKeyRotation }
