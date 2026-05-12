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
  Select,
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
    users: number
    collectiveCerts: number
  }
}

export default function VillagesPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [villages, setVillages] = useState<Village[]>([])
  const [towns, setTowns] = useState<Town[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingVillage, setEditingVillage] = useState<Village | null>(null)
  const [selectedVillageIds, setSelectedVillageIds] = useState<string[]>([])
  const [form] = Form.useForm()

  const loadVillages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/villages')
      const data = await res.json()
      if (data.success) {
        setVillages(data.data)
        setSelectedVillageIds((current) =>
          current.filter((id) => data.data.some((village: Village) => village.id === id)),
        )
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

  const deleteVillageById = useCallback(async (id: string) => {
    const res = await authFetch(`/api/villages/${id}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || '删除失败')
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
  }, [loadVillages, loadTowns])

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
      await deleteVillageById(id)
      message.success('删除成功')
      setSelectedVillageIds((current) => current.filter((selectedId) => selectedId !== id))
      loadVillages()
    } catch {
      message.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedVillageIds.length === 0) return

    try {
      const targets = selectedVillageIds
        .map((id) => villages.find((village) => village.id === id))
        .filter((village): village is Village => Boolean(village))

      const results = await Promise.allSettled(
        targets.map(async (village) => {
          await deleteVillageById(village.id)
          return village
        }),
      )

      const successIds = results
        .map((result, index) => (result.status === 'fulfilled' ? targets[index]?.id : null))
        .filter((id): id is string => Boolean(id))
      const failedVillageNames = results
        .map((result, index) => (result.status === 'rejected' ? targets[index]?.name : null))
        .filter((name): name is string => Boolean(name))

      const successCount = successIds.length
      const failCount = failedVillageNames.length

      if (successCount > 0) {
        message.success(`已删除 ${successCount} 个村居`)
      }
      if (failCount > 0) {
        message.warning(
          `${failCount} 个村居删除失败：${failedVillageNames.slice(0, 3).join('、')}${
            failCount > 3 ? ' 等' : ''
          }`,
        )
      }

      setSelectedVillageIds((current) => current.filter((id) => !successIds.includes(id)))
      loadVillages()
    } catch {
      message.error('批量删除失败')
    }
  }

  const renderActions = (record: Village) => (
    <Space wrap size={isMobile ? 6 : 8}>
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
  )

  const renderVillageCard = (record: Village) => (
    <Card key={record.id} size="small" style={{ borderRadius: 12 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space align="start" size={8} style={{ minWidth: 0, flex: 1 }}>
            <Checkbox
              checked={selectedVillageIds.includes(record.id)}
              onChange={(e) => {
                setSelectedVillageIds((current) =>
                  e.target.checked
                    ? [...current, record.id]
                    : current.filter((id) => id !== record.id),
                )
              }}
            />
            <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
              <strong>{record.name}</strong>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                {record.code} · {record.town.name}
              </span>
            </Space>
          </Space>
          <Tag color={record.status === 'ACTIVE' ? 'green' : 'red'}>
            {record.status === 'ACTIVE' ? '启用' : '禁用'}
          </Tag>
        </Space>
        <Space size={12} wrap>
          <Tag>排序 {record.sortOrder}</Tag>
          <Tag>宅基地 {record._count.bdcs} 个</Tag>
          <Tag>用户 {record._count.users} 个</Tag>
          <Tag>证书 {record._count.collectiveCerts} 个</Tag>
        </Space>
        {renderActions(record)}
      </Space>
    </Card>
  )

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
      title: '系统用户数',
      key: 'users',
      render: (_, record) => `${record._count.users} 个`,
    },
    {
      title: '村集体证书数',
      key: 'collectiveCerts',
      render: (_, record) => `${record._count.collectiveCerts} 个`,
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
        <Space
          direction={isMobile ? 'vertical' : 'horizontal'}
          style={{ width: isMobile ? '100%' : undefined }}
        >
          {selectedVillageIds.length > 0 && (
            <Popconfirm
              title="确认批量删除"
              description={`将删除已选择的 ${selectedVillageIds.length} 个村居`}
              onConfirm={handleBatchDelete}
            >
              <Button danger icon={<DeleteOutlined />} block={isMobile}>
                批量删除（{selectedVillageIds.length}）
              </Button>
            </Popconfirm>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingVillage(null)
              form.resetFields()
              setModalVisible(true)
            }}
            block={isMobile}
          >
            创建村居
          </Button>
        </Space>
      }
      dataSource={villages}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无村居数据"
    >
      {isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {villages.map(renderVillageCard)}
        </Space>
      ) : (
        <Table
          columns={columns}
          dataSource={villages}
          rowKey="id"
          loading={loading}
          rowSelection={{
            selectedRowKeys: selectedVillageIds,
            onChange: (selectedRowKeys) => {
              setSelectedVillageIds(selectedRowKeys as string[])
            },
          }}
          pagination={false}
        />
      )}

      <Modal
        title={editingVillage ? '编辑村居' : '创建村居'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingVillage(null)
          form.resetFields()
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
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
