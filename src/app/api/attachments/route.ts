/**
 * 附件管理 API
 * GET  /api/attachments - 获取附件列表
 * POST /api/attachments - 上传附件
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { safeLogOperation } from '@/lib/log/safe'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// 允许的 MIME 类型
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]

// 最大文件大小 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024

// GET - 获取附件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const fileType = searchParams.get('fileType') || ''
    const keyword = searchParams.get('keyword') || ''
    const collectiveCertId = searchParams.get('collectiveCertId') || ''
    const bdcId = searchParams.get('bdcId') || ''
    const certificateFamily = searchParams.get('certificateFamily') || ''
    const pageType = searchParams.get('pageType') || ''
    const source = searchParams.get('source') || ''

    const where: Record<string, unknown> = {}

    if (fileType) {
      where.fileType = fileType
    }

    if (keyword) {
      where.name = { contains: keyword }
    }

    if (collectiveCertId) {
      where.collectiveCertId = collectiveCertId
    }

    if (bdcId) {
      where.bdcId = bdcId
    }

    if (certificateFamily) {
      where.certificateFamily = certificateFamily
    }

    if (pageType) {
      where.pageType = pageType
    }

    if (source) {
      where.source = source
    }

    const [total, attachments] = await Promise.all([
      prisma.attachment.count({ where }),
      prisma.attachment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        list: attachments,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('Get attachments error:', error)
    return NextResponse.json({ error: '获取附件列表失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST - 上传附件
export async function POST(request: NextRequest) {
  try {
    const authorId = request.headers.get('x-user-id')
    if (!authorId) {
      return NextResponse.json({ error: '未登录', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const collectiveCertId = (formData.get('collectiveCertId') as string) || ''
    const bdcId = (formData.get('bdcId') as string) || ''
    const certificateFamily =
      (formData.get('certificateFamily') as string) ||
      (collectiveCertId ? 'COLLECTIVE' : bdcId ? 'BDC' : '')
    const source = (formData.get('source') as string) || 'web'
    const processed = String(formData.get('processed') || 'false') === 'true'

    if (!file) {
      return NextResponse.json({ error: '未选择文件', code: 'MISSING_FILE' }, { status: 400 })
    }

    const pageType =
      (formData.get('pageType') as string) ||
      (file.type === 'application/pdf' ? 'FULL_PDF' : 'CERT_INFO')

    if (collectiveCertId) {
      const cert = await prisma.collectiveCert.findUnique({
        where: { id: collectiveCertId },
        select: { id: true },
      })
      if (!cert) {
        return NextResponse.json(
          { error: '关联的证书不存在', code: 'CERT_NOT_FOUND' },
          { status: 404 },
        )
      }
    }

    if (bdcId) {
      const cert = await prisma.zjdBdc.findUnique({
        where: { id: bdcId },
        select: { id: true },
      })
      if (!cert) {
        return NextResponse.json(
          { error: '关联的不动产权证不存在', code: 'BDC_NOT_FOUND' },
          { status: 404 },
        )
      }
    }

    // 验证文件类型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: '不支持的文件类型', code: 'INVALID_FILE_TYPE' },
        { status: 400 },
      )
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小超过 50MB 限制', code: 'FILE_TOO_LARGE' },
        { status: 400 },
      )
    }

    // 确保上传目录存在
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'attachments')
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }

    // 生成唯一文件名
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const fileExtension = file.name.split('.').pop() || 'pdf'
    const fileName = `${timestamp}_${randomStr}.${fileExtension}`
    const filePath = join(uploadDir, fileName)

    // 保存文件
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await writeFile(filePath, buffer)

    // 生成访问 URL
    const url = `/uploads/attachments/${fileName}`

    // 获取文件类型
    let fileType = fileExtension.toLowerCase()
    if (fileType === 'docx') fileType = 'docx'
    else if (fileType === 'xlsx') fileType = 'xlsx'

    // 保存到数据库
    const attachment = await prisma.attachment.create({
      data: {
        name: file.name,
        url,
        fileType,
        fileSize: file.size,
        uploadedBy: authorId,
        collectiveCertId: collectiveCertId || undefined,
        bdcId: bdcId || undefined,
        certificateFamily: certificateFamily || undefined,
        pageType: pageType || undefined,
        source,
        processed,
        mimeType: file.type,
      },
    })

    await safeLogOperation({
      userId: authorId,
      action: 'UPLOAD',
      module: 'ATTACHMENT',
      description: `上传附件 ${file.name}`,
      status: 'SUCCESS',
    })

    return NextResponse.json({
      success: true,
      data: attachment,
    })
  } catch (error) {
    console.error('Upload attachment error:', error)
    return NextResponse.json({ error: '上传附件失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
