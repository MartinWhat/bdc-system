'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Input,
  Select,
  Button,
  Space,
  Tag,
  message,
  Typography,
  Empty,
  Spin,
  Table,
  Tree,
  Row,
  Col,
  Avatar,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { DataNode } from 'antd/es/tree'
import {
  SearchOutlined,
  PhoneOutlined,
  MailOutlined,
  CopyOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
  EnvironmentOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'
import PageContainer from '@/components/PageContainer'

const { Text } = Typography

interface Contact {
  id: string
  username: string
  realName: string
  email: string
  phone: string
  avatar?: string
  status: string
  createdAt: string
  village?: {
    id: string
    name: string
    town: {
      id: string
      name: string
    }
  }
  roles: Array<{
    id: string
    name: string
    code: string
  }>
}

interface TownVillageNode {
  id: string
  name: string
  children?: Array<{ id: string; name: string }>
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理员',
  OPERATOR: '操作员',
  VIEWER: '查看者',
}

export default function ContactsPage() {
  const [loading, setLoading] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selectedTownId, setSelectedTownId] = useState<string>('')
  const [selectedVillageId, setSelectedVillageId] = useState<string>('')
  const [towns, setTowns] = useState<TownVillageNode[]>([])

  // 加载镇街列表
  const loadTowns = useCallback(async () => {
    setTreeLoading(true)
    try {
      const res = await authFetch('/api/towns')
      const data = await res.json()
      if (data.success) {
        setTowns(data.data)
      }
    } catch (error) {
      console.error('Load towns error:', error)
    } finally {
      setTreeLoading(false)
    }
  }, [])

  // 加载村居列表（按需）
  const loadVillages = useCallback(async (townId: string) => {
    try {
      const res = await authFetch(`/api/villages?townId=${townId}`)
      const data = await res.json()
      if (data.success) {
        return data.data
      }
    } catch (error) {
      console.error('Load villages error:', error)
    }
    return []
  }, [])

  // 加载联系人列表
  const loadContacts = useCallback(async (kw = '', role = '', townId = '', villageId = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (kw) params.set('keyword', kw)
      if (role) params.set('role', role)
      if (townId) params.set('townId', townId)
      if (villageId) params.set('villageId', villageId)

      const url = `/api/contacts?${params}`
      console.log('[Contacts] Fetching:', url)

      const res = await authFetch(url)
      console.log('[Contacts] Response status:', res.status)

      const data = await res.json()
      console.log('[Contacts] Response data:', data)

      if (data.success) {
        setContacts(data.data.list)
        setTotal(data.data.total)
      } else if (res.status === 401) {
        // 401 错误会触发弹窗，不显示错误提示
        console.log('[Contacts] 401 received, login dialog should appear')
      } else {
        console.error('[Contacts] Error:', data.error)
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('[Contacts] Load error:', error)
      message.error('加载通讯录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTowns()
    loadContacts()
  }, [loadTowns, loadContacts])

  // 构建树形数据
  const buildTreeData = useCallback((): DataNode[] => {
    const allNode: DataNode = {
      title: (
        <Space>
          <UsergroupAddOutlined />
          <span>全部用户</span>
        </Space>
      ),
      key: 'all',
      icon: <UsergroupAddOutlined />,
    }

    const townNodes: DataNode[] = towns.map((town) => ({
      title: (
        <Space>
          <EnvironmentOutlined />
          <span>{town.name}</span>
        </Space>
      ),
      key: `town-${town.id}`,
      icon: <EnvironmentOutlined />,
      isLeaf: false,
      children: town.children?.map((village) => ({
        title: (
          <Space>
            <HomeOutlined />
            <span>{village.name}</span>
          </Space>
        ),
        key: `village-${village.id}`,
        icon: <HomeOutlined />,
        isLeaf: true,
      })),
    }))

    return [allNode, ...townNodes]
  }, [towns])

  // 处理树节点点击
  const onTreeSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) return

    const key = selectedKeys[0] as string
    if (key === 'all') {
      setSelectedTownId('')
      setSelectedVillageId('')
      loadContacts(keyword, roleFilter, '', '')
    } else if (key.startsWith('town-')) {
      const townId = key.replace('town-', '')
      setSelectedTownId(townId)
      setSelectedVillageId('')
      loadContacts(keyword, roleFilter, townId, '')
    } else if (key.startsWith('village-')) {
      const villageId = key.replace('village-', '')
      setSelectedVillageId(villageId)
      loadContacts(keyword, roleFilter, '', villageId)
    }
  }

  // 处理动态加载村居
  const onLoadData = async ({ key }: { key: React.Key }) => {
    const keyStr = key as string
    if (!keyStr.startsWith('town-')) return

    const townId = keyStr.replace('town-', '')
    const villages = await loadVillages(townId)

    // 更新树节点
    setTowns((prev) =>
      prev.map((town) => (town.id === townId ? { ...town, children: villages } : town)),
    )
  }

  // 搜索防抖
  const handleSearch = (value: string) => {
    setTimeout(() => {
      loadContacts(value, roleFilter, selectedTownId, selectedVillageId)
    }, 300)
  }

  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setKeyword(value)
    handleSearch(value)
  }

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value)
    loadContacts(keyword, value, selectedTownId, selectedVillageId)
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(`${type}已复制`)
    } catch (error) {
      message.error('复制失败')
    }
  }

  const exportContacts = async () => {
    try {
      const res = await authFetch('/api/contacts/export')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `通讯录_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      message.success('导出成功')
    } catch (error) {
      console.error('Export error:', error)
      message.error('导出失败')
    }
  }

  // 表格列定义
  const columns: ColumnsType<Contact> = [
    {
      title: '用户',
      dataIndex: 'realName',
      key: 'user',
      width: 200,
      render: (_, record) => (
        <Space>
          <Avatar style={{ backgroundColor: '#1890ff' }} size="large">
            {record.realName.charAt(0)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 'bold' }}>{record.realName}</div>
            <div style={{ fontSize: 12, color: '#999' }}>@{record.username}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 150,
      render: (roles: Contact['roles']) => (
        <Space wrap>
          {roles.map((role) => (
            <Tag key={role.id} color="blue">
              {ROLE_LABELS[role.code] || role.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '所属村居',
      key: 'village',
      width: 150,
      render: (_, record) =>
        record.village ? (
          <Space>
            <HomeOutlined style={{ color: '#52c41a' }} />
            <span>{record.village.name}</span>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 150,
      render: (phone) =>
        phone ? (
          <Space>
            <PhoneOutlined style={{ color: '#52c41a' }} />
            <Text>{phone}</Text>
            <Tooltip title="点击复制">
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#999' }}
                onClick={() => copyToClipboard(phone, '手机号')}
              />
            </Tooltip>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email) =>
        email ? (
          <Space>
            <MailOutlined style={{ color: '#1890ff' }} />
            <Text ellipsis style={{ maxWidth: 150 }}>
              {email}
            </Text>
            <Tooltip title="点击复制">
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#999' }}
                onClick={() => copyToClipboard(email, '邮箱')}
              />
            </Tooltip>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.phone && (
            <Tooltip title="复制手机">
              <Button
                type="text"
                size="small"
                icon={<PhoneOutlined />}
                onClick={() => copyToClipboard(record.phone, '手机号')}
              />
            </Tooltip>
          )}
          {record.email && (
            <Tooltip title="复制邮箱">
              <Button
                type="text"
                size="small"
                icon={<MailOutlined />}
                onClick={() => copyToClipboard(record.email, '邮箱')}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const roleOptions = [
    { label: '全部角色', value: '' },
    { label: '管理员', value: 'ADMIN' },
    { label: '操作员', value: 'OPERATOR' },
    { label: '查看者', value: 'VIEWER' },
  ]

  return (
    <PageContainer
      title="通讯录"
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportContacts}>
            导出
          </Button>
        </Space>
      }
    >
      <div style={{ height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
        <Row gutter={16} style={{ height: '100%' }}>
          {/* 左侧：镇街村居树 */}
          <Col span={6} style={{ height: '100%' }}>
            <div
              style={{
                background: '#fff',
                padding: 16,
                borderRadius: 8,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ marginBottom: 16, flexShrink: 0 }}>
                <Input
                  placeholder="搜索姓名或邮箱"
                  prefix={<SearchOutlined />}
                  value={keyword}
                  onChange={handleKeywordChange}
                  allowClear
                />
              </div>
              <div style={{ marginBottom: 8, flexShrink: 0 }}>
                <Select
                  placeholder="筛选角色"
                  value={roleFilter}
                  onChange={handleRoleFilterChange}
                  options={roleOptions}
                  style={{ width: '100%' }}
                  allowClear
                />
              </div>
              <div style={{ fontWeight: 'bold', marginBottom: 8, flexShrink: 0 }}>区域筛选</div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {treeLoading ? (
                  <Spin size="small" />
                ) : (
                  <Tree
                    treeData={buildTreeData()}
                    onSelect={onTreeSelect}
                    loadData={onLoadData}
                    defaultExpandAll={false}
                    selectedKeys={
                      selectedVillageId
                        ? [`village-${selectedVillageId}`]
                        : selectedTownId
                          ? [`town-${selectedTownId}`]
                          : ['all']
                    }
                  />
                )}
              </div>
            </div>
          </Col>

          {/* 右侧：用户列表表格 */}
          <Col span={18} style={{ height: '100%', overflow: 'hidden' }}>
            <div
              style={{
                background: '#fff',
                padding: 16,
                borderRadius: 8,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Text type="secondary">共 {total} 位联系人</Text>
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '100px 0' }}>
                    <Spin size="large" />
                  </div>
                ) : contacts.length === 0 ? (
                  <Empty description="暂无联系人" />
                ) : (
                  <Table
                    columns={columns}
                    dataSource={contacts}
                    rowKey="id"
                    pagination={{
                      pageSize: 20,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 位`,
                    }}
                    scroll={{ x: 1000 }}
                    size="middle"
                  />
                )}
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </PageContainer>
  )
}
