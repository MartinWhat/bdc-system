'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Image,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CameraOutlined,
  DeleteOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'
import { enhanceDocumentImage } from '@/lib/opencv/document-cropper'

const { Text } = Typography

export interface CollectiveAttachment {
  id: string
  name: string
  url: string
  fileType: string
  fileSize?: number | null
  uploadedBy: string
  collectiveCertId?: string | null
  bdcId?: string | null
  certificateFamily?: string | null
  pageType?: string | null
  source?: string | null
  processed?: boolean
  mimeType?: string | null
  createdAt: string
  legacy?: boolean
}

export type CertificateFamily = 'COLLECTIVE' | 'BDC'
type PageType = 'CERT_INFO' | 'MAP' | 'MANAGEMENT' | 'FULL_PDF'
type DraftKind = 'image' | 'pdf'
type DraftSource = 'camera' | 'gallery' | 'pdf'

interface AttachmentDraft {
  kind: DraftKind
  source: DraftSource
  pageType: PageType
  originalFile: File
  originalPreviewUrl: string
  processedFile: File
  processedPreviewUrl: string
  detected: boolean
  useProcessed: boolean
}

interface CollectiveAttachmentManagerProps {
  certId?: string
  bdcId?: string
  certificateFamily: CertificateFamily
  attachments: CollectiveAttachment[]
  onChanged: () => Promise<void> | void
}

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const getFileTypeLabel = (attachment: CollectiveAttachment) => {
  if (attachment.processed && attachment.source !== 'pdf') {
    return '扫描后图片'
  }
  if (attachment.fileType === 'pdf') {
    return 'PDF 扫描件'
  }
  if (
    attachment.fileType === 'jpg' ||
    attachment.fileType === 'jpeg' ||
    attachment.fileType === 'png'
  ) {
    return '拍照图片'
  }
  return attachment.fileType.toUpperCase()
}

const getSourceLabel = (source?: string | null) => {
  switch (source) {
    case 'camera':
      return '相机'
    case 'gallery':
      return '相册'
    case 'pdf':
      return 'PDF'
    default:
      return '网页上传'
  }
}

const PAGE_TYPE_OPTIONS: Record<CertificateFamily, Array<{ label: string; value: PageType }>> = {
  COLLECTIVE: [
    { label: '证载信息页', value: 'CERT_INFO' },
    { label: '附图页', value: 'MAP' },
  ],
  BDC: [
    { label: '证书管理页', value: 'MANAGEMENT' },
    { label: '证载信息页', value: 'CERT_INFO' },
    { label: '附图页', value: 'MAP' },
  ],
}

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  CERT_INFO: '证载信息页',
  MAP: '附图页',
  MANAGEMENT: '证书管理页',
  FULL_PDF: 'PDF 扫描件',
}

const getPageTypeOptions = (family: CertificateFamily) => PAGE_TYPE_OPTIONS[family]

const getPageTypeLabel = (pageType?: string | null) => {
  if (!pageType) return '-'
  return PAGE_TYPE_LABELS[pageType as PageType] || pageType
}

export default function CollectiveAttachmentManager({
  certId,
  bdcId,
  certificateFamily,
  attachments,
  onChanged,
}: CollectiveAttachmentManagerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const pdfInputRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState<AttachmentDraft | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const pageTypeOptions = getPageTypeOptions(certificateFamily)

  useEffect(() => {
    return () => {
      if (draft?.originalPreviewUrl) {
        URL.revokeObjectURL(draft.originalPreviewUrl)
      }
      if (draft?.processedPreviewUrl && draft.processedPreviewUrl !== draft.originalPreviewUrl) {
        URL.revokeObjectURL(draft.processedPreviewUrl)
      }
    }
  }, [draft])

  const currentPreviewUrl = useMemo(() => {
    if (!draft) return ''
    return draft.useProcessed ? draft.processedPreviewUrl : draft.originalPreviewUrl
  }, [draft])

  const clearDraft = () => {
    setDraft((current) => {
      if (current?.originalPreviewUrl) {
        URL.revokeObjectURL(current.originalPreviewUrl)
      }
      if (
        current?.processedPreviewUrl &&
        current.processedPreviewUrl !== current.originalPreviewUrl
      ) {
        URL.revokeObjectURL(current.processedPreviewUrl)
      }
      return null
    })
  }

  const preparePdf = async (file: File) => {
    clearDraft()
    const previewUrl = URL.createObjectURL(file)
    setDraft({
      kind: 'pdf',
      source: 'pdf',
      pageType: 'FULL_PDF',
      originalFile: file,
      originalPreviewUrl: previewUrl,
      processedFile: file,
      processedPreviewUrl: previewUrl,
      detected: false,
      useProcessed: false,
    })
    message.success('PDF 已准备上传')
  }

  const prepareImage = async (file: File, source: 'camera' | 'gallery') => {
    clearDraft()
    setProcessing(true)
    try {
      const result = await enhanceDocumentImage(file)
      setDraft({
        kind: 'image',
        source,
        pageType: pageTypeOptions[0]?.value ?? 'CERT_INFO',
        originalFile: result.originalFile,
        originalPreviewUrl: result.originalPreviewUrl,
        processedFile: result.processedFile,
        processedPreviewUrl: result.processedPreviewUrl,
        detected: result.detected,
        useProcessed: result.detected,
      })
      message.success(result.detected ? '已自动识别并裁切文档' : '未识别到纸张边缘，已保留原图')
    } catch (error) {
      console.error('Prepare image attachment error:', error)
      const fallbackUrl = URL.createObjectURL(file)
      setDraft({
        kind: 'image',
        source,
        pageType: pageTypeOptions[0]?.value ?? 'CERT_INFO',
        originalFile: file,
        originalPreviewUrl: fallbackUrl,
        processedFile: file,
        processedPreviewUrl: fallbackUrl,
        detected: false,
        useProcessed: false,
      })
      message.warning('图片识别失败，已保留原图')
    } finally {
      setProcessing(false)
    }
  }

  const handleUpload = async () => {
    if (!draft) return
    if (!certId && !bdcId) {
      message.error('缺少证书关联信息')
      return
    }

    setUploading(true)
    try {
      const uploadFile = draft.useProcessed ? draft.processedFile : draft.originalFile
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (certId) formData.append('collectiveCertId', certId)
      if (bdcId) formData.append('bdcId', bdcId)
      formData.append('certificateFamily', certificateFamily)
      formData.append('pageType', draft.pageType)
      formData.append('source', draft.source)
      formData.append(
        'processed',
        String(draft.kind === 'image' && draft.useProcessed && draft.detected),
      )

      const res = await authFetch('/api/attachments', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.success) {
        message.success('附件上传成功')
        clearDraft()
        await onChanged()
      } else {
        message.error(data.error || '上传失败')
      }
    } catch (error) {
      console.error('Upload attachment error:', error)
      message.error('附件上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (attachmentId: string) => {
    try {
      const res = await authFetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        message.success('附件已删除')
        await onChanged()
      } else {
        message.error(data.error || '删除失败')
      }
    } catch (error) {
      console.error('Delete attachment error:', error)
      message.error('附件删除失败')
    }
  }

  const columns: ColumnsType<CollectiveAttachment> = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space>
          {record.fileType === 'pdf' ? (
            <FilePdfOutlined style={{ color: '#ff4d4f' }} />
          ) : (
            <FileImageOutlined style={{ color: '#722ed1' }} />
          )}
          <a href={record.url} target="_blank" rel="noreferrer noopener">
            {name}
          </a>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 140,
      render: (_: string, record) => <Tag color="blue">{getFileTypeLabel(record)}</Tag>,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (source?: string | null) => <Tag>{getSourceLabel(source)}</Tag>,
    },
    {
      title: '页类型',
      dataIndex: 'pageType',
      key: 'pageType',
      width: 130,
      render: (pageType?: string | null) => <Tag>{getPageTypeLabel(pageType)}</Tag>,
    },
    {
      title: '处理',
      dataIndex: 'processed',
      key: 'processed',
      width: 100,
      render: (_: boolean | undefined, record) =>
        record.fileType === 'pdf' ? (
          <Tag color="purple">原始 PDF</Tag>
        ) : (
          <Tag color={record.processed ? 'green' : 'default'}>
            {record.processed ? '已裁切' : '原图'}
          </Tag>
        ),
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 110,
      render: formatFileSize,
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (createdAt: string) => new Date(createdAt).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: unknown, record) => (
        <Space>
          <a href={record.url} target="_blank" rel="noreferrer noopener">
            查看
          </a>
          {record.legacy ? (
            <Tag color="default">历史附件</Tag>
          ) : (
            <Popconfirm title="确定删除该附件？" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Alert
        type="info"
        message="附件录入说明"
        description={`支持 PDF 扫描件和手机拍照图片。当前证书类型下可选页类型：${pageTypeOptions.map((item) => item.label).join(' / ')}。拍照图片会优先在浏览器内自动识别文档边缘并裁切，识别失败时可直接保留原图上传。`}
      />

      <Space wrap>
        <Button
          type="primary"
          icon={<CameraOutlined />}
          onClick={() => cameraInputRef.current?.click()}
          loading={processing}
        >
          拍照上传
        </Button>
        <Button icon={<FileImageOutlined />} onClick={() => galleryInputRef.current?.click()}>
          相册选择
        </Button>
        <Button icon={<FilePdfOutlined />} onClick={() => pdfInputRef.current?.click()}>
          PDF 扫描件
        </Button>
        <Button icon={<ReloadOutlined />} onClick={clearDraft} disabled={!draft || uploading}>
          清空预览
        </Button>
      </Space>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            await prepareImage(file, 'camera')
          }
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            await prepareImage(file, 'gallery')
          }
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            await preparePdf(file)
          }
        }}
      />

      {draft && (
        <Card
          size="small"
          title="待上传文件"
          extra={
            <Space>
              {draft.kind === 'image' && draft.detected && (
                <>
                  <Button
                    size="small"
                    type={draft.useProcessed ? 'primary' : 'default'}
                    onClick={() => setDraft({ ...draft, useProcessed: true })}
                  >
                    使用裁切结果
                  </Button>
                  <Button
                    size="small"
                    type={!draft.useProcessed ? 'primary' : 'default'}
                    onClick={() => setDraft({ ...draft, useProcessed: false })}
                  >
                    使用原图
                  </Button>
                </>
              )}
              <Button size="small" onClick={clearDraft}>
                重新选择
              </Button>
            </Space>
          }
        >
          <Space align="start" size="large" style={{ width: '100%' }}>
            {draft.kind === 'pdf' ? (
              <Card size="small" style={{ minWidth: 260 }}>
                <Space direction="vertical">
                  <FilePdfOutlined style={{ fontSize: 40, color: '#ff4d4f' }} />
                  <Text strong>{draft.originalFile.name}</Text>
                  <Tag color="red">PDF 扫描件</Tag>
                </Space>
              </Card>
            ) : (
              <Image
                width={240}
                src={currentPreviewUrl}
                alt="附件预览"
                style={{ borderRadius: 8 }}
              />
            )}

            <Space direction="vertical" style={{ flex: 1 }}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="文件名">{draft.originalFile.name}</Descriptions.Item>
                <Descriptions.Item label="来源">{getSourceLabel(draft.source)}</Descriptions.Item>
                <Descriptions.Item label="证书家族">
                  {certificateFamily === 'COLLECTIVE' ? '村集体所有权证' : '不动产权证'}
                </Descriptions.Item>
                <Descriptions.Item label="页类型">
                  <Select
                    value={draft.pageType}
                    options={
                      draft.kind === 'pdf'
                        ? [{ label: 'PDF 扫描件', value: 'FULL_PDF' }]
                        : pageTypeOptions
                    }
                    disabled={draft.kind === 'pdf'}
                    onChange={(value) => setDraft({ ...draft, pageType: value })}
                    style={{ width: '100%' }}
                  />
                </Descriptions.Item>
                <Descriptions.Item label="识别结果">
                  {draft.kind === 'pdf'
                    ? '不处理'
                    : draft.detected
                      ? '已自动识别并裁切'
                      : '未识别到边缘，保留原图'}
                </Descriptions.Item>
                <Descriptions.Item label="上传内容">
                  {draft.useProcessed && draft.kind === 'image' ? '裁切后的扫描件' : '原始文件'}
                </Descriptions.Item>
              </Descriptions>

              <Space wrap>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={handleUpload}
                  loading={uploading}
                  disabled={uploading}
                >
                  上传附件
                </Button>
                <Button onClick={clearDraft} disabled={uploading}>
                  取消
                </Button>
              </Space>
            </Space>
          </Space>
        </Card>
      )}

      <Card size="small" title={`已关联附件（${attachments.length}）`}>
        {attachments.length > 0 ? (
          <Table
            size="small"
            columns={columns}
            dataSource={attachments}
            rowKey="id"
            pagination={false}
          />
        ) : (
          <Empty description="暂无附件" />
        )}
      </Card>
    </Space>
  )
}
