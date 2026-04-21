import 'dotenv/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { createPool } from 'mariadb'

// 从 DATABASE_URL 解析连接参数
function parseDatabaseUrl(url: string) {
  // mysql://user:password@host:port/database
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
  if (!match) {
    throw new Error(`Invalid DATABASE_URL: ${url}`)
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const connectionConfig = parseDatabaseUrl(databaseUrl)

const adapter = new PrismaMariaDb({
  ...connectionConfig,
  connectionLimit: 5,
})

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
