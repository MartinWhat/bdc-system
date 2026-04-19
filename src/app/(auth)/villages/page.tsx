'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Space,
  Tag,
  Popconfirm,
  Typography,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

interface Town {
  id: string
  code: string
  name: string
}

interface Village {
  id: string
  code: string
  name: string
  townId: string
  status: string
  sortOrder: number
  createdAt: string
  town: Town
  _count: {
    bdcs: number
  }
}

export default function VillagesPage() {
  const [villages, setVillages] = useState<Village[]>([])
  const [towns, setTowns] = useState<Town[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingVillage, setEditingVillage] = useState<Village | null>(null)
  const [form] = Form.useForm()

  const loadVillages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/villages')
      const data = await res.json()
      if (data.success) {
        setVillages(data.data)
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load villages error:', error)
      message.error('加载村居列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTowns = useCallback(async () => {
    try {
      const res = await authFetch('/api/towns')
      const data = await res.json()
      if (data.success) {
        setTowns(data.data)
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load towns error:', error)
      message.error('加载镇街失败')
    }
  }, [])

  useEffect(() => {
    loadVillages()
    loadTowns()
  }, [])

  const handleSubmit = async (values: {
    code: string
    name: string
    townId: string
    sortOrder?: number
  }) => {
    try {
      const url = editingVillage ? `/api/villages/${editingVillage.id}` : '/api/villages'
      const method = editingVillage ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingVillage ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingVillage(null)
        loadVillages()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Submit error:', error)
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/villages/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadVillages()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns: ColumnsType<Village> = [
    {
      title: '村居代码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '村居名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '所属镇街',
      key: 'town',
      render: (_, record) => record.town.name,
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
    },
    {
      title: '宅基地数',
      key: 'bdcs',
      render: (_, record) => `${record._count.bdcs} 个`,
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
              setEditingVillage(record)
              form.setFieldsValue({
                ...record,
                townId: record.townId,
              })
              setModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除前请确保该村居下没有宅基地档案"
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
    <PageContainer
      title="村居管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingVillage(null)
            form.resetFields()
            setModalVisible(true)
          }}
        >
          创建村居
        </Button>
      }
      dataSource={villages}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无村居数据"
    >
      <Table
        columns={columns}
        dataSource={villages}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingVillage ? '编辑村居' : '创建村居'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingVillage(null)
          form.resetFields()
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="townId"
            label="所属镇街"
            rules={[{ required: true, message: '请选择所属镇街' }]}
          >
            <Select placeholder="请选择镇街">
              {towns.map((town) => (
                <Select.Option key={town.id} value={town.id}>
                  {town.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="code"
            label="村居代码"
            rules={[{ required: true, message: '请输入村居代码' }]}
          >
            <Input disabled={!!editingVillage} />
          </Form.Item>
          <Form.Item
            name="name"
            label="村居名称"
            rules={[{ required: true, message: '请输入村居名称' }]}
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
              {editingVillage ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
