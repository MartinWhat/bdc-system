'use client'

import { useState, useEffect } from 'react'
import {
  Typography,
  Table,
  Button,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  message,
  Popconfirm,
  Progress,
} from 'antd'
import {
  KeyOutlined,
  PlusOutlined,
  SyncOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  SafetyOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { authFetch } from '@/lib/api-fetch'

const { Title } = Typography
const { Option } = Select

interface Key {
  id: string
  keyType: string
  version: number
  isActive: boolean
  isArchived: boolean
  expiresAt: string
  encryptedDataCount: number
  migratedToKeyId: string | null
  createdAt: string
}

interface KeyStats {
  summary: {
    totalKeys: number
    activeKeys: number
    archivedKeys: number
    totalEncryptedData: number
  }
  keys: Array<{
    keyType: string
    activeKey: {
      id: string
      version: number
      expiresAt: string
      daysUntilExpiry: number
    }
    historicalKeys: number
    archivedKeys: number
    totalEncryptedData: number
  }>
  rotationConfig: Record<string, number>
}

interface Alert {
  level: 'info' | 'warning' | 'critical'
  type: string
  message: string
  timestamp: string
}

export default function KmsPage() {
  const [keys, setKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<KeyStats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [createForm] = Form.useForm()

  // 加载密钥列表
  const loadKeys = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/kms/keys?includeArchived=true')
      const data = await res.json()
      if (data.success) {
        setKeys(data.data)
      }
    } catch (error) {
      console.error('Load keys error:', error)
    } finally {
      setLoading(false)
    }
  }

  // 加载统计信息
  const loadStats = async () => {
    try {
      const res = await authFetch('/api/kms/stats')
      const data = await res.json()
      if (data.success) {
        setStats(data.data)
      }

      // 加载告警
      const alertRes = await authFetch('/api/kms/stats?type=alerts')
      const alertData = await alertRes.json()
      if (alertData.success) {
        setAlerts(alertData.data.alerts)
      }
    } catch (error) {
      console.error('Load stats error:', error)
    }
  }

  useEffect(() => {
    loadKeys()
    loadStats()
  }, [])

  // 创建密钥
  const handleCreate = async (values: any) => {
    try {
      const res = await authFetch('/api/kms/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
          createdBy: 'admin',
        }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('密钥创建成功')
        setCreateModalVisible(false)
        createForm.resetFields()
        loadKeys()
        loadStats()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('创建失败')
    }
  }

  // 激活密钥
  const handleActivate = async (id: string) => {
    try {
      const res = await authFetch(`/api/kms/keys/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'activate' }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('密钥已激活')
        loadKeys()
        loadStats()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  // 归档密钥
  const handleArchive = async (id: string) => {
    try {
      const res = await authFetch(`/api/kms/keys/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'archive' }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('密钥已归档')
        loadKeys()
        loadStats()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  // 删除密钥
  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/kms/keys/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('密钥已删除')
        loadKeys()
        loadStats()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 获取密钥类型名称
  const getKeyTypeName = (type: string) => {
    const names: Record<string, string> = {
      MASTER_KEY: '主密钥',
      SM4_DATA: '数据加密密钥',
      SM2_SIGN: '签名密钥',
      JWT_SECRET: 'JWT 密钥',
    }
    return names[type] || type
  }

  // 获取状态标签
  const getStatusTag = (key: Key) => {
    if (key.isActive) {
      return <Tag color="green">活跃</Tag>
    }
    if (key.isArchived) {
      return <Tag color="orange">归档</Tag>
    }
    return <Tag color="blue">历史</Tag>
  }

  // 表格列配置
  const columns = [
    {
      title: '密钥类型',
      dataIndex: 'keyType',
      key: 'keyType',
      render: (type: string) => getKeyTypeName(type),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (version: number) => `v${version}`,
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Key) => getStatusTag(record),
    },
    {
      title: '加密数据',
      dataIndex: 'encryptedDataCount',
      key: 'encryptedDataCount',
      render: (count: number) => count || 0,
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Key) => (
        <Space>
          {!record.isActive && !record.isArchived && (
            <Button size="small" type="primary" onClick={() => handleActivate(record.id)}>
              激活
            </Button>
          )}
          {!record.isArchived && !record.isActive && (
            <Button size="small" onClick={() => handleArchive(record.id)}>
              归档
            </Button>
          )}
          {!record.isActive && (
            <Popconfirm
              title="确定删除该密钥？"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>
          <KeyOutlined style={{ marginRight: 8 }} />
          密钥管理
        </Title>
        <Space>
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setCreateModalVisible(true)}
          >
            创建密钥
          </Button>
          <Button
            icon={<FileSearchOutlined />}
            onClick={() => window.open('/kms/migrate', '_blank')}
          >
            数据迁移
          </Button>
          <Button
            icon={<SyncOutlined />}
            onClick={() => {
              loadKeys()
              loadStats()
            }}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* 告警信息 */}
      {alerts.length > 0 && (
        <Card style={{ marginBottom: 24 }} bordered={false}>
          {alerts.map((alert, index) => (
            <div key={index} style={{ marginBottom: index < alerts.length - 1 ? 8 : 0 }}>
              <WarningOutlined
                style={{
                  color:
                    alert.level === 'critical'
                      ? '#ff4d4f'
                      : alert.level === 'warning'
                        ? '#faad14'
                        : '#1890ff',
                  marginRight: 8,
                }}
              />
              {alert.message}
            </div>
          ))}
        </Card>
      )}

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card bordered={false}>
              <Statistic
                title="活跃密钥"
                value={stats.summary.activeKeys}
                prefix={<SafetyOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false}>
              <Statistic
                title="历史密钥"
                value={stats.summary.totalKeys - stats.summary.activeKeys}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false}>
              <Statistic
                title="归档密钥"
                value={stats.summary.archivedKeys}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false}>
              <Statistic title="加密数据" value={stats.summary.totalEncryptedData} suffix="条" />
            </Card>
          </Col>
        </Row>
      )}

      {/* 密钥列表 */}
      <Card title="密钥列表" bordered={false}>
        <Table
          columns={columns}
          dataSource={keys}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 创建密钥弹窗 */}
      <Modal
        title="创建密钥"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
        }}
        footer={null}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="keyType"
            label="密钥类型"
            rules={[{ required: true, message: '请选择密钥类型' }]}
          >
            <Select>
              <Option value="MASTER_KEY">主密钥 (MASTER_KEY)</Option>
              <Option value="SM4_DATA">数据加密密钥 (SM4_DATA)</Option>
              <Option value="SM2_SIGN">签名密钥 (SM2_SIGN)</Option>
              <Option value="JWT_SECRET">JWT 密钥 (JWT_SECRET)</Option>
            </Select>
          </Form.Item>
          <Form.Item name="expiresAt" label="过期时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
