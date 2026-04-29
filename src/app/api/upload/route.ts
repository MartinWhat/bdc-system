/**
 * 文件上传 API
 * POST /api/upload - 上传文件（照片等）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sm4Encrypt } from '@/lib/gm-crypto'
import { getActiveKey } from '@/lib/kms'
import { withPermission } from '@/lib/api/withPermission'
import { z } from 'zod'

// 最大文件大小：10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

const uploadSchema = z.object({
  fileName: z.string().min(1, '文件名不能为空'),
  fileType: z.enum(['image/jpeg', 'image/png', 'image/jpg']),
  base64Data: z.string().min(1, '文件内容不能为空').max(MAX_FILE_SIZE, '文件大小不能超过 10MB'),
  recordId: z.string().min(1, '领证记录 ID 不能为空'),
  fileCategory: z.enum(['ID_CARD_FRONT', 'ID_CARD_BACK', 'SCENE_PHOTO']),
})

async function uploadFileHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = uploadSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: '请求参数错误', details: validationResult.error.message },
        { status: 400 },
      )
    }

    const { fileName, fileType, base64Data, recordId, fileCategory } = validationResult.data
    const operatorId = request.headers.get('x-user-id')

    if (!operatorId) {
      return NextResponse.json(
        { error: '未认证或认证已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    // 验证领证记录存在
    const record = await prisma.zjdReceiveRecord.findUnique({
      where: { id: recordId },
    })

    if (!record) {
      return NextResponse.json(
        { error: '领证记录不存在', code: 'RECORD_NOT_FOUND' },
        { status: 404 },
      )
    }

    // 验证领证记录状态是否允许上传
    if (!['PENDING', 'ISSUED'].includes(record.status)) {
      return NextResponse.json(
        { error: '当前状态不允许上传文件', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    // 验证 Base64 数据格式（检查魔数）
    const base64Prefixes: Record<string, string> = {
      'image/jpeg': '/9j/',
      'image/png': 'iVBOR',
      'image/jpg': '/9j/',
    }
    const expectedPrefix = base64Prefixes[fileType]
    if (!base64Data.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: '文件内容与声明的类型不匹配', code: 'INVALID_FILE_TYPE' },
        { status: 400 },
      )
    }

    // 获取加密密钥
    const sm4KeyRecord = await getActiveKey('SM4_DATA')

    // 生成随机 IV
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    const iv = Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // 加密文件数据
    const encryptedData = sm4Encrypt(base64Data, sm4KeyRecord.keyData, iv)

    // 存储格式：iv:encryptedBase64
    const storedData = `${iv}:${encryptedData.ciphertext}`

    // 根据文件类别更新记录
    const updateField = {
      ID_CARD_FRONT: 'idCardFrontPhoto',
      ID_CARD_BACK: 'idCardBackPhoto',
      SCENE_PHOTO: 'scenePhoto',
    }[fileCategory]

    await prisma.zjdReceiveRecord.update({
      where: { id: recordId },
      data: { [updateField]: storedData },
    })

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        fileCategory,
        stored: true,
      },
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上传失败', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
export const POST = withPermission(['upload:file'])(uploadFileHandler)
