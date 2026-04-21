'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  Button,
  Upload,
  message,
  Space,
  Tag,
  Popconfirm,
  Input,
  Select,
  Card,
  Progress,
} from 'antd'
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  SearchOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

const { Dragger } = Upload

interface Attachment {
  id: string
  name: string
  url: string
  fileType: string
  fileSize?: number | null
  uploadedBy: string
  createdAt: string
}

const fileTypeOptions = [
  { label: '全部类型', value: '' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'doc' },
  { label: 'Excel', value: 'xls' },
  { label: '图片', value: 'image' },
]

const getFileTypeIcon = (fileType: string) => {
  switch (fileType) {
    case 'pdf':
      return <FilePdfOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
    case 'doc':
    case 'docx':
      return <FileWordOutlined style={{ fontSize: 20, color: '#1890ff' }} />
    case 'xls':
    case 'xlsx':
      return <FileExcelOutlined style={{ fontSize: 20, color: '#52c41a' }} />
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'image':
      return <FileImageOutlined style={{ fontSize: 20, color: '#722ed1' }} />
    default:
      return <FileOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />
  }
}

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

export default function AttachmentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [fileType, setFileType] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)

  useEffect(() => {
    fetchAttachments()
  }, [page, pageSize, keyword, fileType])

  const fetchAttachments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (fileType) params.set('fileType', fileType)
      if (keyword) params.set('keyword', keyword)

      const res = await authFetch(`/api/attachments?${params}`)
      const data = await res.json()
      if (data.success) {
        setAttachments(data.data.list)
        setTotal(data.data.total)
      }
    } catch (error) {
      console.error('Fetch attachments error:', error)
      message.error('加载附件列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, fileType])

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/attachments/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        fetchAttachments()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
    beforeUpload: (file) => {
      const isValidType = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
      ].includes(file.type)

      if (!isValidType) {
        message.error('只能上传 PDF、Word、Excel 或图片文件')
        return false
      }

      const isLt50M = file.size / 1024 / 1024 < 50
      if (!isLt50M) {
        message.error('文件大小不能超过 50MB')
        return false
      }

      return true
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file as File)

        const res = await authFetch('/api/attachments', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()

        if (data.success) {
          message.success('上传成功')
          setUploadModalVisible(false)
          fetchAttachments()
          onSuccess?.(data)
        } else {
          message.error(data.error)
          onError?.(data as any)
        }
      } catch (error) {
        message.error('上传失败')
        onError?.(error as any)
      } finally {
        setUploading(false)
      }
    },
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Attachment) => (
        <Space>
          {getFileTypeIcon(record.fileType)}
          <a href={record.url} target="_blank" rel="noopener noreferrer">
            {name}
          </a>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 100,
      render: (fileType: string) => {
        const colorMap: Record<string, string> = {
          pdf: 'red',
          doc: 'blue',
          docx: 'blue',
          xls: 'green',
          xlsx: 'green',
          jpg: 'purple',
          jpeg: 'purple',
          png: 'purple',
        }
        return <Tag color={colorMap[fileType] || 'default'}>{fileType.toUpperCase()}</Tag>
      },
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
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
      width: 150,
      render: (_: unknown, record: Attachment) => (
        <Space>
          <a href={record.url} target="_blank" rel="noopener noreferrer">
            查看
          </a>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="附件库"
      subTitle="管理和查看系统中的附件文件"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModalVisible(true)}>
          上传附件
        </Button>
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索文件名"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            options={fileTypeOptions}
            value={fileType}
            onChange={setFileType}
            style={{ width: 120 }}
          />
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={attachments}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
        />
      </Card>

      {/* 上传对话框 */}
      {uploadModalVisible && (
        <Card
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            width: 500,
          }}
        >
          <h3>上传附件</h3>
          <Dragger {...uploadProps} style={{ marginTop: 16 }}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持 PDF、Word、Excel 和图片文件，单个文件不超过 50MB</p>
          </Dragger>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setUploadModalVisible(false)}>取消</Button>
            </Space>
          </div>
          {uploading && <Progress percent={50} status="active" style={{ marginTop: 16 }} />}
        </Card>
      )}

      {uploadModalVisible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 999,
          }}
          onClick={() => setUploadModalVisible(false)}
        />
      )}
    </PageContainer>
  )
}
