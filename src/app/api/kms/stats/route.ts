/**
 * 密钥统计 API
 * GET - 获取密钥统计信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateKeyStatusReport, checkAlerts, getKeyUsageStats } from '@/lib/kms/monitor'
import { KEY_ROTATION_DAYS } from '@/lib/kms'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'alerts') {
      // 获取告警信息
      const alerts = await checkAlerts()
      return NextResponse.json({
        success: true,
        data: { alerts },
      })
    }

    if (type === 'usage') {
      // 获取使用统计
      const stats = await getKeyUsageStats()
      return NextResponse.json({
        success: true,
        data: stats,
      })
    }

    // 默认获取完整报告
    const report = await generateKeyStatusReport()

    // 统计汇总
    const summary = {
      totalKeys: report.reduce((sum, r) => sum + r.historicalKeys + 1, 0),
      activeKeys: report.length,
      archivedKeys: report.reduce((sum, r) => sum + r.archivedKeys, 0),
      totalEncryptedData: report.reduce((sum, r) => sum + r.totalEncryptedData, 0),
    }

    // 密钥轮换配置
    const rotationConfig = KEY_ROTATION_DAYS

    return NextResponse.json({
      success: true,
      data: {
        summary,
        rotationConfig,
        keys: report,
      },
    })
  } catch (error) {
    console.error('Get kms stats error:', error)
    return NextResponse.json({ error: '获取统计信息失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
