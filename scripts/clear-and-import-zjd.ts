/**
 * 清除并重新导入 ZjdBdc 数据
 * 运行: npx tsx scripts/clear-and-import-zjd.ts
 */

import 'dotenv/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { createPool } from 'mariadb'
import * as fs from 'fs'
import * as path from 'path'

interface ImportRow {
  certNo: string
  ownerName: string
  idCard: string
  address: string
  area: number
  status: string
  certIssuedDate: string | null
  recorder: string
  certNos: string
  originalAddress: string
  rejectReason: string | null
  receiveId: string
  villageId: string | null
  applicant: string
  receiverName: string
  receiveTime: string
  issuerName: string
  acceptorName: string
  acceptDate: string
  businessNo: string
  businessTitle: string
  isRejected: boolean
}

function parseDatabaseUrl(url: string) {
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
  if (!match) throw new Error(`Invalid DATABASE_URL`)
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL not set')

  const config = parseDatabaseUrl(databaseUrl)
  const adapter = new PrismaMariaDb({ ...config, connectionLimit: 5 })
  const prisma = new PrismaClient({ adapter })

  try {
    const jsonPath = path.resolve(__dirname, '../../zjd-import-data.json')
    const jsonData = fs.readFileSync(jsonPath, 'utf-8')
    const rows: ImportRow[] = JSON.parse(jsonData)
    console.log(`📖 读取数据: ${rows.length} 条`)

    console.log('🗑️  清除旧数据...')
    const deleteResult = await prisma.zjdBdc.deleteMany({})
    console.log(`   已删除: ${deleteResult.count} 条`)

    console.log('📥 导入新数据...')
    let imported = 0
    let skipped = 0

    for (const row of rows) {
      if (!row.villageId) {
        skipped++
        continue
      }

      await prisma.zjdBdc.create({
        data: {
          id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          villageId: row.villageId,
          certNo: row.certNo,
          ownerName: row.ownerName,
          idCard: row.idCard,
          idCardHash: '',
          address: row.address,
          area: row.area,
          landUseType: '宅基地',
          status: row.status,
          certIssuedDate: row.certIssuedDate ? new Date(row.certIssuedDate) : null,
          recorder: row.recorder || null,
          certNos: row.certNos || null,
          originalAddress: row.originalAddress || null,
          rejectReason: row.rejectReason,
          receiveId: row.receiveId,
          applicant: row.applicant || null,
          receiverName: row.receiverName || null,
          receiveTime: row.receiveTime ? new Date(row.receiveTime) : null,
          issuerName: row.issuerName || null,
          acceptorName: row.acceptorName || null,
          acceptDate: row.acceptDate ? new Date(row.acceptDate) : null,
          businessNo: row.businessNo || null,
          businessTitle: row.businessTitle || null,
          isRejected: row.isRejected || false,
          isOneWindow: false,
          createdBy: 'import-script',
        },
      })
      imported++
      if (imported % 500 === 0) console.log(`   已导入: ${imported} 条`)
    }

    console.log(`\n✅ 导入完成`)
    console.log(`   成功: ${imported} 条`)
    console.log(`   跳过: ${skipped} 条`)
  } catch (error) {
    console.error('❌ 导入失败:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
