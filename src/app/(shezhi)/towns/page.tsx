'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Space,
  Tag,
  Popconfirm,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

interface Town {
  id: string
  code: string
  name: string
  status: string
  sortOrder: number
  createdAt: string
  _count: {
    villages: number
  }
}

export default function TownsPage() {
  const [towns, setTowns] = useState<Town[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTown, setEditingTown] = useState<Town | null>(null)
  const [form] = Form.useForm()

  const loadTowns = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/towns')
      const data = await res.json()
      if (data.success) {
        setTowns(data.data)
      }
    } catch (error) {
      message.error('加载镇街列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTowns()
  }, [])

  const handleSubmit = async (values: any) => {
    try {
      const url = editingTown ? `/api/towns/${editingTown.id}` : '/api/towns'
      const method = editingTown ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingTown ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingTown(null)
        loadTowns()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/towns/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadTowns()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns: ColumnsType<Town> = [
    {
      title: '镇街代码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '镇街名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
    },
    {
      title: '村居数',
      key: 'villages',
      render: (_, record) => `${record._count.villages} 个`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>
          {status === 'ACTIVE' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingTown(record)
              form.setFieldsValue(record)
              setModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除前请确保该镇街下没有村居"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>镇街管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingTown(null)
            form.resetFields()
            setModalVisible(true)
          }}
        >
          创建镇街
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={towns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingTown ? '编辑镇街' : '创建镇街'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingTown(null)
          form.resetFields()
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="code"
            label="镇街代码"
            rules={[{ required: true, message: '请输入镇街代码' }]}
          >
            <Input disabled={!!editingTown} />
          </Form.Item>
          <Form.Item
            name="name"
            label="镇街名称"
            rules={[{ required: true, message: '请输入镇街名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="排序"
            rules={[{ required: true, message: '请输入排序' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingTown ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
