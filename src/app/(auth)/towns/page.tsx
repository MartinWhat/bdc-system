'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Grid,
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
  Checkbox,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

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
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [towns, setTowns] = useState<Town[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTown, setEditingTown] = useState<Town | null>(null)
  const [selectedTownIds, setSelectedTownIds] = useState<string[]>([])
  const [form] = Form.useForm()

  const loadTowns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/towns')
      const data = await res.json()
      if (data.success) {
        setTowns(data.data)
        setSelectedTownIds((current) =>
          current.filter((id) => data.data.some((town: Town) => town.id === id)),
        )
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load towns error:', error)
      message.error('加载镇街列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTowns()
  }, [loadTowns])

  const handleSubmit = async (values: { code: string; name: string; sortOrder?: number }) => {
    try {
      const url = editingTown ? `/api/towns/${editingTown.id}` : '/api/towns'
      const method = editingTown ? 'PUT' : 'POST'

      const res = await authFetch(url, {
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
      console.error('Submit error:', error)
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/towns/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadTowns()
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedTownIds.length === 0) return

    try {
      const targets = selectedTownIds
        .map((id) => towns.find((town) => town.id === id))
        .filter((town): town is Town => Boolean(town))

      const results = await Promise.allSettled(
        targets.map(async (town) => {
          await authFetch(`/api/towns/${town.id}`, {
            method: 'DELETE',
          }).then(async (res) => {
            const data = await res.json()
            if (!data.success) {
              throw new Error(data.error || '删除失败')
            }
          })
          return town
        }),
      )

      const successIds = results
        .map((result, index) => (result.status === 'fulfilled' ? targets[index]?.id : null))
        .filter((id): id is string => Boolean(id))
      const failedTownNames = results
        .map((result, index) => (result.status === 'rejected' ? targets[index]?.name : null))
        .filter((name): name is string => Boolean(name))

      const successCount = successIds.length
      const failCount = failedTownNames.length

      if (successCount > 0) {
        message.success(`已删除 ${successCount} 个镇街`)
      }
      if (failCount > 0) {
        message.warning(
          `${failCount} 个镇街删除失败：${failedTownNames.slice(0, 3).join('、')}${
            failCount > 3 ? ' 等' : ''
          }`,
        )
      }

      setSelectedTownIds((current) => current.filter((id) => !successIds.includes(id)))
      loadTowns()
    } catch {
      message.error('批量删除失败')
    }
  }

  const renderActions = (record: Town) => (
    <Space wrap size={isMobile ? 6 : 8}>
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
  )

  const renderTownCard = (record: Town) => (
    <Card key={record.id} size="small" style={{ borderRadius: 12 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space align="start" size={8} style={{ minWidth: 0, flex: 1 }}>
            <Checkbox
              checked={selectedTownIds.includes(record.id)}
              onChange={(e) => {
                setSelectedTownIds((current) =>
                  e.target.checked
                    ? [...current, record.id]
                    : current.filter((id) => id !== record.id),
                )
              }}
            />
            <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
              <strong>{record.name}</strong>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.code}</span>
            </Space>
          </Space>
          <Tag color={record.status === 'ACTIVE' ? 'green' : 'red'}>
            {record.status === 'ACTIVE' ? '启用' : '禁用'}
          </Tag>
        </Space>
        <Space size={12} wrap>
          <Tag>排序 {record.sortOrder}</Tag>
          <Tag>村居 {record._count.villages} 个</Tag>
        </Space>
        {renderActions(record)}
      </Space>
    </Card>
  )

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
    <PageContainer
      title="镇街管理"
      extra={
        <Space
          direction={isMobile ? 'vertical' : 'horizontal'}
          style={{ width: isMobile ? '100%' : undefined }}
        >
          {selectedTownIds.length > 0 && (
            <Popconfirm
              title="确认批量删除"
              description={`将删除已选择的 ${selectedTownIds.length} 个镇街`}
              onConfirm={handleBatchDelete}
            >
              <Button danger icon={<DeleteOutlined />} block={isMobile}>
                批量删除（{selectedTownIds.length}）
              </Button>
            </Popconfirm>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingTown(null)
              form.resetFields()
              setModalVisible(true)
            }}
            block={isMobile}
          >
            创建镇街
          </Button>
        </Space>
      }
      dataSource={towns}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无镇街数据"
    >
      {isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {towns.map(renderTownCard)}
        </Space>
      ) : (
        <Table
          columns={columns}
          dataSource={towns}
          rowKey="id"
          loading={loading}
          rowSelection={{
            selectedRowKeys: selectedTownIds,
            onChange: (selectedRowKeys) => {
              setSelectedTownIds(selectedRowKeys as string[])
            },
          }}
          pagination={false}
        />
      )}

      <Modal
        title={editingTown ? '编辑镇街' : '创建镇街'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingTown(null)
          form.resetFields()
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
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
    </PageContainer>
  )
}
