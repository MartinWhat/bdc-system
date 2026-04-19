'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Input,
  Select,
  Modal,
  Form,
  message,
  Popconfirm,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '系统通知', value: 'SYSTEM' },
  { label: '政策文件', value: 'POLICY' },
  { label: '公告', value: 'ANNOUNCEMENT' },
]

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '已归档', value: 'ARCHIVED' },
]

const priorityOptions = [
  { label: '普通', value: 'NORMAL' },
  { label: '低', value: 'LOW' },
  { label: '高', value: 'HIGH' },
  { label: '紧急', value: 'URGENT' },
]

const typeTagColors: Record<string, string> = {
  SYSTEM: 'blue',
  POLICY: 'purple',
  ANNOUNCEMENT: 'cyan',
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

export default function NotificationManagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    fetchNotifications()
  }, [page, pageSize, keyword, type, status])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (keyword) params.set('keyword', keyword)
      if (type) params.set('type', type)
      // 管理页面默认显示所有状态，所以始终传递空字符串
      params.set('status', status)

      const res = await fetch(`/api/notifications?${params}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
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

  const handleCreate = () => {
    setEditingId(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: NotificationItem) => {
    setEditingId(record.id)
    form.setFieldsValue({
      title: record.title,
      content: record.content,
      type: record.type,
      priority: record.priority,
      isPopup: record.isPopup,
      isPinned: record.isPinned,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        fetchNotifications()
      } else {
        message.error(data.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/notifications/${id}/publish`, {
        method: 'PUT',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        message.success('发布成功')
        fetchNotifications()
      } else {
        message.error(data.error || '发布失败')
      }
    } catch (error) {
      message.error('发布失败')
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const token = localStorage.getItem('access_token')
      const url = editingId ? `/api/notifications/${editingId}` : '/api/notifications'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(values),
      })
      const data = await res.json()

      if (data.success) {
        message.success(editingId ? '更新成功' : '创建成功')
        setModalVisible(false)
        fetchNotifications()
      } else {
        message.error(data.error || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: NotificationItem) => (
        <Space>
          {record.isPinned && <Tag color="gold">置顶</Tag>}
          {title}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={typeTagColors[type]}>
          {type === 'SYSTEM' ? '系统通知' : type === 'POLICY' ? '政策文件' : '公告'}
        </Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: string) => {
        const colors: Record<string, string> = {
          LOW: 'default',
          NORMAL: 'blue',
          HIGH: 'orange',
          URGENT: 'red',
        }
        const labels: Record<string, string> = {
          LOW: '低',
          NORMAL: '普通',
          HIGH: '高',
          URGENT: '紧急',
        }
        return <Tag color={colors[priority]}>{labels[priority]}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const colors: Record<string, string> = {
          DRAFT: 'default',
          PUBLISHED: 'success',
          ARCHIVED: 'default',
        }
        const labels: Record<string, string> = {
          DRAFT: '草稿',
          PUBLISHED: '已发布',
          ARCHIVED: '已归档',
        }
        return <Tag color={colors[status]}>{labels[status]}</Tag>
      },
    },
    {
      title: '弹窗',
      dataIndex: 'isPopup',
      key: 'isPopup',
      width: 60,
      render: (isPopup: boolean) => (isPopup ? '是' : '否'),
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 120,
      render: (date?: string) => (date ? new Date(date).toLocaleDateString('zh-CN') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: NotificationItem) => (
        <Space size="small">
          {record.status === 'DRAFT' && (
            <Button
              type="link"
              size="small"
              icon={<SendOutlined />}
              onClick={() => handlePublish(record.id)}
            >
              发布
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="通知管理"
      subTitle="发布和管理系统通知、政策文件和公告"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          发布通知
        </Button>
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索标题"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select options={typeOptions} value={type} onChange={setType} style={{ width: 120 }} />
          <Select
            options={statusOptions}
            value={status}
            onChange={setStatus}
            style={{ width: 120 }}
          />
        </Space>
      </Card>

      <Card>
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
        />
      </Card>

      <Modal
        title={editingId ? '编辑通知' : '发布通知'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ priority: 'NORMAL' }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入通知标题" />
          </Form.Item>

          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <Input.TextArea rows={6} placeholder="请输入通知内容（支持富文本HTML）" />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item name="type" label="类型" initialValue="ANNOUNCEMENT">
              <Select options={typeOptions.filter((o) => o.value !== '')} style={{ width: 120 }} />
            </Form.Item>

            <Form.Item name="priority" label="优先级">
              <Select options={priorityOptions} style={{ width: 100 }} />
            </Form.Item>

            <Form.Item name="isPopup" label="弹窗提醒" valuePropName="checked">
              <input type="checkbox" />
            </Form.Item>

            <Form.Item name="isPinned" label="置顶" valuePropName="checked">
              <input type="checkbox" />
            </Form.Item>
          </Space>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingId ? '保存' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
