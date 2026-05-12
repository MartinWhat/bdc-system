/**
 * 单个村集体证书 API
 * GET    /api/collective/[id] - 获取证书详情
 * PUT    /api/collective/[id] - 更新证书信息
 * DELETE /api/collective/[id] - 注销证书
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptSensitiveField, encryptSensitiveField } from '@/lib/gm-crypto'
import { z } from 'zod'

const updateCertSchema = z.object({
  ownerName: z.string().min(1).optional(),
  ownerType: z.enum(['VILLAGE_COLLECTIVE', 'TOWN_COLLECTIVE']).optional(),
  villageId: z.string().optional(),
  idCard: z.string().length(18).optional(),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/)
    .optional(),
  address: z.string().min(1).optional(),
  area: z.number().positive().optional(),
  landUseType: z.string().optional(),
  certIssueDate: z.string().optional(),
  certExpiryDate: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  remark: z.string().optional(),
})

// GET - 获取证书详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const cert = await prisma.collectiveCert.findUnique({
      where: { id },
      include: {
        village: {
          include: {
            town: true,
          },
        },
        operations: {
          orderBy: { createdAt: 'desc' },
        },
        certAttachments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!cert) {
      return NextResponse.json({ error: '证书不存在', code: 'CERT_NOT_FOUND' }, { status: 404 })
    }

    const legacyAttachments = Array.isArray(cert.attachments)
      ? cert.attachments
          .map((item, index) => {
            let url = ''
            let name = `附件${index + 1}`

            if (typeof item === 'string') {
              url = item
              name = item.split('/').pop() || name
            } else if (item && typeof item === 'object') {
              const legacyItem = item as Record<string, unknown>
              url = typeof legacyItem.url === 'string' ? legacyItem.url : ''
              name = typeof legacyItem.name === 'string' ? legacyItem.name : name
            }

            if (!url) return null

            const fileType = (() => {
              const lowerUrl = url.toLowerCase()
              if (lowerUrl.endsWith('.pdf')) return 'pdf'
              if (lowerUrl.endsWith('.png')) return 'png'
              if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'jpg'
              return 'file'
            })()

            const pageType = (() => {
              const text = `${name} ${url}`.toLowerCase()
              if (text.includes('管理')) return 'MANAGEMENT'
              if (text.includes('附图') || text.includes('map') || text.includes('图')) return 'MAP'
              if (text.includes('证载') || text.includes('信息')) return 'CERT_INFO'
              if (fileType === 'pdf') return 'FULL_PDF'
              return null
            })()

            return {
              id: `legacy-${cert.id}-${index}`,
              name,
              url,
              fileType,
              fileSize: null,
              uploadedBy: 'legacy',
              collectiveCertId: cert.id,
              bdcId: null,
              certificateFamily: 'COLLECTIVE',
              pageType,
              source: 'web',
              processed: false,
              mimeType: null,
              createdAt: cert.createdAt.toISOString(),
              legacy: true,
            }
          })
          .filter(Boolean)
      : []

    // 解密敏感字段（详情页显示完整信息，但仍需脱敏）
    let idCard = cert.idCard
    let phone = cert.phone

    if (idCard) {
      idCard = await decryptSensitiveField(idCard)
    }

    if (phone) {
      phone = await decryptSensitiveField(phone)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...cert,
        idCard,
        phone,
        certAttachments: [...legacyAttachments, ...(cert.certAttachments || [])],
      },
    })
  } catch (error) {
    console.error('Get collective cert detail error:', error)
    return NextResponse.json({ error: '获取证书详情失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT - 更新证书信息
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const validationResult = updateCertSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const data = validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查证书是否存在
    const cert = await prisma.collectiveCert.findUnique({
      where: { id },
    })

    if (!cert) {
      return NextResponse.json({ error: '证书不存在', code: 'CERT_NOT_FOUND' }, { status: 404 })
    }

    // 只有待审核或在库状态的证书可以修改
    if (!['PENDING_APPROVE', 'IN_STOCK'].includes(cert.status)) {
      return NextResponse.json(
        { error: '当前状态不允许修改', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 加密敏感字段
    let encryptedIdCard: string | undefined
    let encryptedPhone: string | undefined

    if (data.idCard) {
      const encrypted = await encryptSensitiveField(data.idCard)
      encryptedIdCard = encrypted.encrypted
    }

    if (data.phone) {
      const encrypted = await encryptSensitiveField(data.phone)
      encryptedPhone = encrypted.encrypted
    }

    // 更新证书
    const updatedCert = await prisma.collectiveCert.update({
      where: { id },
      data: {
        ownerName: data.ownerName,
        ownerType: data.ownerType,
        villageId: data.villageId,
        idCard: encryptedIdCard,
        phone: encryptedPhone,
        address: data.address,
        area: data.area,
        landUseType: data.landUseType,
        certIssueDate: data.certIssueDate ? new Date(data.certIssueDate) : undefined,
        certExpiryDate: data.certExpiryDate ? new Date(data.certExpiryDate) : undefined,
        attachments: data.attachments || undefined,
        remark: data.remark,
      },
      include: {
        village: {
          include: {
            town: true,
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: updatedCert })
  } catch (error) {
    console.error('Update collective cert error:', error)
    return NextResponse.json({ error: '更新证书失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// DELETE - 注销证书
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 检查证书是否存在
    const cert = await prisma.collectiveCert.findUnique({
      where: { id },
    })

    if (!cert) {
      return NextResponse.json({ error: '证书不存在', code: 'CERT_NOT_FOUND' }, { status: 404 })
    }

    // 只有在库状态的证书可以注销
    if (cert.status !== 'IN_STOCK') {
      return NextResponse.json(
        { error: '只有在库状态的证书可以注销', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const cancelReason = searchParams.get('reason') || '管理员注销'

    // 使用事务更新证书状态并创建操作记录
    const result = await prisma.$transaction(async (tx) => {
      const updatedCert = await tx.collectiveCert.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelBy: operatorId,
          cancelAt: new Date(),
          cancelReason,
        },
      })

      await tx.certOperation.create({
        data: {
          certId: id,
          operationType: 'CANCEL',
          operatorId,
          operatorName: '系统',
          description: cancelReason,
        },
      })

      return updatedCert
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Delete collective cert error:', error)
    return NextResponse.json({ error: '注销证书失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
