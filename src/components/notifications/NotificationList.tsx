'use client'

import React, { useState, useEffect } from 'react'
import { Table, Tag, Space, Button, Input, Select, Typography, Card } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '系统通知', value: 'SYSTEM' },
  { label: '政策文件', value: 'POLICY' },
  { label: '公告', value: 'ANNOUNCEMENT' },
]

const priorityColors = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
}

const typeLabels = {
  SYSTEM: '系统通知',
  POLICY: '政策文件',
  ANNOUNCEMENT: '公告',
}

const statusLabels = {
  DRAFT: { text: '草稿', color: 'default' },
  PUBLISHED: { text: '已发布', color: 'success' },
  ARCHIVED: { text: '已归档', color: 'default' },
}

interface NotificationItem {
  id: string
  title: string
  content: string
  type: 'SYSTEM' | 'POLICY' | 'ANNOUNCEMENT'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  isPopup: boolean
  isPinned: boolean
  readCount: number
  publishedAt?: string
  createdAt: string
  author: {
    id: string
    realName: string
  }
}

interface NotificationListProps {
  showManageButton?: boolean
}

export function NotificationList({ showManageButton = false }: NotificationListProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState('')

  useEffect(() => {
    fetchNotifications()
  }, [page, pageSize, keyword, type])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        keyword,
        status: 'PUBLISHED',
      })
      if (type) params.set('type', type)

      const res = await authFetch(`/api/notifications?${params}`)
      const data = await res.json()
      if (data.success) {
        setNotifications(data.data.list)
        setTotal(data.data.total)
      }
    } catch (error) {
      console.error('Fetch notifications error:', error)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: NotificationItem) => (
        <a
          onClick={() => router.push(`/notifications/${record.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {record.isPinned && <Tag color="gold">置顶</Tag>}
          {title}
        </a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: keyof typeof typeLabels) => (
        <Tag color={type === 'SYSTEM' ? 'blue' : type === 'POLICY' ? 'purple' : 'cyan'}>
          {typeLabels[type]}
        </Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: keyof typeof priorityColors) => (
        <Tag color={priorityColors[priority]}>
          {priority === 'URGENT'
            ? '紧急'
            : priority === 'HIGH'
              ? '高'
              : priority === 'NORMAL'
                ? '普通'
                : '低'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: keyof typeof statusLabels) => (
        <Tag color={statusLabels[status].color}>{statusLabels[status].text}</Tag>
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 120,
      render: (date?: string) => (date ? new Date(date).toLocaleDateString('zh-CN') : '-'),
    },
    {
      title: '阅读数',
      dataIndex: 'readCount',
      key: 'readCount',
      width: 80,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '发布人',
      dataIndex: 'author',
      key: 'author',
      width: 100,
      render: (author: NotificationItem['author']) => author?.realName || '-',
    },
  ]

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Input
            placeholder="搜索通知标题"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select options={typeOptions} value={type} onChange={setType} style={{ width: 120 }} />
          {showManageButton && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/notifications/manage')}
            >
              发布通知
            </Button>
          )}
        </Space>

        <Table
          columns={columns}
          dataSource={notifications}
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
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => router.push(`/notifications/${record.id}`),
          })}
        />
      </Space>
    </Card>
  )
}

export default NotificationList
