/**
 * 附件选择器组件
 * 用于从附件库中选择文件
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Modal, Table, Input, Select, Tag, Space, Button, Card } from 'antd'
import {
  SearchOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'

interface Attachment {
  id: string
  name: string
  url: string
  fileType: string
  fileSize?: number | null
  createdAt: string
}

interface AttachmentSelectorProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string, name: string) => void
  fileTypeFilter?: string[] // 允许的文件类型过滤
}

const getFileTypeIcon = (fileType: string) => {
  switch (fileType) {
    case 'pdf':
      return <FilePdfOutlined style={{ fontSize: 16, color: '#ff4d4f' }} />
    case 'doc':
    case 'docx':
      return <FileWordOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    case 'xls':
    case 'xlsx':
      return <FileExcelOutlined style={{ fontSize: 16, color: '#52c41a' }} />
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'image':
      return <FileImageOutlined style={{ fontSize: 16, color: '#722ed1' }} />
    default:
      return <FileOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />
  }
}

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

export function AttachmentSelector({
  open,
  onClose,
  onSelect,
  fileTypeFilter,
}: AttachmentSelectorProps) {
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [fileType, setFileType] = useState('')

  useEffect(() => {
    if (open) {
      fetchAttachments()
    }
  }, [open, page, keyword, fileType])

  const fetchAttachments = async () => {
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
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (record: Attachment) => {
    onSelect(record.url, record.name)
    onClose()
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Attachment) => (
        <Space>
          {getFileTypeIcon(record.fileType)}
          {name}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 80,
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
      width: 80,
      render: formatFileSize,
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (createdAt: string) => new Date(createdAt).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Attachment) => (
        <Button type="link" size="small" onClick={() => handleSelect(record)}>
          选择
        </Button>
      ),
    },
  ]

  const fileTypeOptions = [
    { label: '全部类型', value: '' },
    { label: 'PDF', value: 'pdf' },
    { label: 'Word', value: 'doc' },
    { label: 'Excel', value: 'xls' },
    { label: '图片', value: 'image' },
  ]

  return (
    <Modal title="选择附件" open={open} onCancel={onClose} footer={null} width={800} destroyOnClose>
      <div style={{ marginBottom: 16 }}>
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
      </div>

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
          onChange: (p) => setPage(p),
        }}
        onRow={(record: Attachment) => ({
          onClick: () => handleSelect(record),
          style: { cursor: 'pointer' },
        })}
      />
    </Modal>
  )
}
