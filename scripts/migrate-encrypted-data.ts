/**
 * 数据迁移脚本 - 将旧密钥加密的数据迁移到新密钥
 *
 * 使用方法：npx tsx scripts/migrate-encrypted-data.ts <oldKeyId> <newKeyId>
 *
 * 示例：npx tsx scripts/migrate-encrypted-data.ts key123 key456
 */

import { prisma } from '@/lib/prisma'
import { decryptSensitiveField } from '@/lib/gm-crypto'
import { encryptWithContext, createEncryptionContext } from '@/lib/gm-crypto'
import { markKeyAsMigrated, updateKeyDataCount } from '@/lib/kms'

// 需要迁移的表和字段配置
const MIGRATION_CONFIG = [
  {
    table: 'zjd_bdc',
    fields: ['idCard', 'phone'],
    nameField: 'ownerName', // 用于显示
  },
  {
    table: 'sys_user',
    fields: ['idCard', 'phone'],
    nameField: 'realName',
  },
  // 添加更多需要迁移的表...
]

async function migrateEncryptedData(oldKeyId: string, newKeyId: string) {
  console.log(`🔄 开始迁移加密数据...`)
  console.log(`   旧密钥：${oldKeyId}`)
  console.log(`   新密钥：${newKeyId}\n`)

  let totalMigrated = 0
  let totalFailed = 0

  // 获取新密钥的加密上下文
  const context = await createEncryptionContext()

  for (const config of MIGRATION_CONFIG) {
    console.log(`📋 迁移表：${config.table}`)

    let migrated = 0
    let failed = 0

    // 查询该表的所有记录（包含加密字段）
    const records = (await prisma.$queryRawUnsafe(
      `SELECT * FROM ${config.table} WHERE ${config.fields[0]} LIKE '%:%'`,
    )) as any[]

    console.log(`   找到 ${records.length} 条记录需要迁移`)

    for (const record of records) {
      try {
        const updateData: Record<string, string> = {}

        // 解密并重新加密每个字段
        for (const field of config.fields) {
          const encryptedValue = record[field]
          if (encryptedValue) {
            // 解密（使用旧密钥，自动尝试所有历史密钥）
            const plaintext = await decryptSensitiveField(encryptedValue)

            // 重新加密（使用新密钥）
            const { encrypted } = encryptWithContext(plaintext, context)

            updateData[field] = encrypted
          }
        }

        // 更新记录
        if (Object.keys(updateData).length > 0) {
          await prisma.$executeRawUnsafe(
            `UPDATE ${config.table} SET ${Object.keys(updateData)
              .map((f) => `${f} = ?`)
              .join(', ')} WHERE id = ?`,
            ...Object.values(updateData),
            record.id,
          )
          migrated++
        }
      } catch (error) {
        console.error(`   ❌ 迁移记录 ${record.id} 失败:`, error)
        failed++
      }
    }

    console.log(`   ✅ 迁移完成：${migrated} 条，失败：${failed} 条\n`)
    totalMigrated += migrated
    totalFailed += failed
  }

  // 更新密钥元数据
  await markKeyAsMigrated(oldKeyId, newKeyId)
  await updateKeyDataCount(newKeyId, totalMigrated)

  console.log(`\n📊 迁移汇总:`)
  console.log(`   成功：${totalMigrated} 条`)
  console.log(`   失败：${totalFailed} 条`)
  console.log(`\n✅ 数据迁移完成！\n`)

  return { migrated: totalMigrated, failed: totalFailed }
}

// 命令行执行
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log('用法：npx tsx scripts/migrate-encrypted-data.ts <oldKeyId> <newKeyId>')
    console.log('\n示例：npx tsx scripts/migrate-encrypted-data.ts key123 key456\n')
    process.exit(1)
  }

  const [oldKeyId, newKeyId] = args

  try {
    await migrateEncryptedData(oldKeyId, newKeyId)
  } catch (error) {
    console.error('迁移失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

export { migrateEncryptedData }
