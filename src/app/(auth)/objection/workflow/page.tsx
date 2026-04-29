'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Switch, message, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

interface WorkflowStep {
  id: string
  stepOrder: number
  stepName: string
  stepType: string
  approverRole?: string
  isRequired: boolean
}

interface Workflow {
  id: string
  name: string
  description?: string
  isActive: boolean
  steps: WorkflowStep[]
  createdAt: string
}

export default function WorkflowListPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [form] = Form.useForm()

  const loadWorkflows = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/objection-workflow')
      if (res.ok) {
        const data = await res.json()
        setWorkflows(data.data || [])
      }
    } catch (error) {
      console.error('Load workflows error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflows()
  }, [])

  const handleCreate = () => {
    router.push('/objection/workflow/new')
  }

  const handleEdit = (record: Workflow) => {
    router.push(`/objection/workflow/${record.id}`)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/objection-workflow/${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('删除成功')
        loadWorkflows()
      } else {
        const error = await res.json()
        message.error(error.error || '删除失败')
      }
    } catch (error) {
      console.error('Delete error:', error)
    }
  }

  const columns: ColumnsType<Workflow> = [
    {
      title: '流程名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Workflow) => (
        <Space>
          {name}
          {!record.isActive && <Tag color="red">已禁用</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '步骤数',
      key: 'stepCount',
      render: (_, record) => <span>{record.steps.length} 步</span>,
    },
    {
      title: '步骤详情',
      key: 'steps',
      render: (_, record) => (
        <Space wrap>
          {record.steps.map((step) => (
            <Tag key={step.id} color="blue">
              {step.stepOrder}. {step.stepName}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => new Date(createdAt).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此流程吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
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
      title="异议处理流程配置"
      extra={[
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建流程
        </Button>,
      ]}
    >
      <Table columns={columns} dataSource={workflows} rowKey="id" loading={loading} bordered />
    </PageContainer>
  )
}
