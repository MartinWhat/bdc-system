'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Modal,
  Input,
  Tree,
  Card,
  Avatar,
  Space,
  Typography,
  Spin,
  Empty,
  Row,
  Col,
  Button,
} from 'antd'
import type { DataNode } from 'antd/es/tree'
import {
  SearchOutlined,
  UserOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

export interface User {
  id: string
  username: string
  realName: string
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

interface ApproverSelectorModalProps {
  visible: boolean
  onCancel: () => void
  onConfirm: (user: User | null) => void
  initialValue?: User | null
}

export default function ApproverSelectorModal({
  visible,
  onCancel,
  onConfirm,
  initialValue,
}: ApproverSelectorModalProps) {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialValue?.id || null)
  const [selectedUser, setSelectedUser] = useState<User | null>(initialValue || null)
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

  // 加载用户列表
  const loadUsers = useCallback(async (kw = '', townId = '', villageId = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (kw) params.set('keyword', kw)
      if (townId) params.set('townId', townId)
      if (villageId) params.set('villageId', villageId)

      const res = await authFetch(`/api/contacts?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setUsers(data.data.list || [])
          setTotal(data.data.total || 0)
        }
      }
    } catch (error) {
      console.error('Load users error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (visible) {
      loadTowns()
      loadUsers()
      setSelectedUserId(initialValue?.id || null)
      setSelectedUser(initialValue || null)
    }
  }, [visible, loadTowns, loadUsers, initialValue])

  // 构建树形数据
  const buildTreeData = useCallback((): DataNode[] => {
    const allNode: DataNode = {
      title: '全部用户',
      key: 'all',
      icon: <UsergroupAddOutlined />,
    }

    const townNodes: DataNode[] = towns.map((town) => ({
      title: town.name,
      key: `town-${town.id}`,
      icon: <EnvironmentOutlined />,
      isLeaf: false,
      children: town.children?.map((village) => ({
        title: village.name,
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
      loadUsers(keyword, '', '')
    } else if (key.startsWith('town-')) {
      const townId = key.replace('town-', '')
      setSelectedTownId(townId)
      setSelectedVillageId('')
      loadUsers(keyword, townId, '')
    } else if (key.startsWith('village-')) {
      const villageId = key.replace('village-', '')
      setSelectedVillageId(villageId)
      loadUsers(keyword, '', villageId)
    }
  }

  // 处理动态加载村居
  const onLoadData = async ({ key }: { key: React.Key }) => {
    const keyStr = key as string
    if (!keyStr.startsWith('town-')) return

    const townId = keyStr.replace('town-', '')
    const villages = await loadVillages(townId)

    setTowns((prev) =>
      prev.map((town) => (town.id === townId ? { ...town, children: villages } : town)),
    )
  }

  // 搜索处理
  const handleSearch = (value: string) => {
    setKeyword(value)
    setTimeout(() => {
      loadUsers(value, selectedTownId, selectedVillageId)
    }, 300)
  }

  // 处理用户选择
  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id)
    setSelectedUser(user)
  }

  // 获取角色标签
  const getRoleLabel = (roles: User['roles']) => {
    if (!roles || roles.length === 0) return '-'
    return roles
      .map((r) =>
        r.code === 'ADMIN'
          ? '管理员'
          : r.code === 'OPERATOR'
            ? '操作员'
            : r.code === 'VIEWER'
              ? '查看者'
              : r.name,
      )
      .join(', ')
  }

  // 确认选择
  const handleConfirm = () => {
    onConfirm(selectedUser)
  }

  return (
    <Modal
      title="选择处理人"
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      width={900}
      okText="确定"
      cancelText="取消"
    >
      {/* 已选用户提示 */}
      {selectedUser && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
          <Text type="secondary">已选择：</Text>
          <Text strong style={{ marginLeft: 8 }}>
            {selectedUser.realName} ({getRoleLabel(selectedUser.roles)})
          </Text>
        </div>
      )}

      <div style={{ height: 500, overflow: 'hidden' }}>
        <Row gutter={16} style={{ height: '100%' }}>
          {/* 左侧：组织架构树 */}
          <Col span={7} style={{ height: '100%' }}>
            <div
              style={{
                background: '#fafafa',
                padding: 16,
                borderRadius: 8,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ marginBottom: 12, flexShrink: 0 }}>
                <Input
                  placeholder="搜索姓名"
                  prefix={<SearchOutlined />}
                  value={keyword}
                  onChange={(e) => handleSearch(e.target.value)}
                  allowClear
                />
              </div>
              <div style={{ fontWeight: 'bold', marginBottom: 8, flexShrink: 0 }}>组织架构</div>
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

          {/* 右侧：用户列表 */}
          <Col span={17} style={{ height: '100%', overflow: 'hidden' }}>
            <div
              style={{
                background: '#fafafa',
                padding: 16,
                borderRadius: 8,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ marginBottom: 12, flexShrink: 0 }}>
                <Text type="secondary">共 {total} 位用户</Text>
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '100px 0' }}>
                    <Spin size="large" />
                  </div>
                ) : users.length === 0 ? (
                  <Empty description="暂无用户" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {users.map((user) => (
                      <Card
                        key={user.id}
                        hoverable
                        size="small"
                        onClick={() => handleSelectUser(user)}
                        style={{
                          background: selectedUserId === user.id ? '#e6f7ff' : '#fff',
                          border:
                            selectedUserId === user.id ? '1px solid #1890ff' : '1px solid #f0f0f0',
                        }}
                      >
                        <Space style={{ width: '100%' }}>
                          <Avatar style={{ backgroundColor: '#1890ff' }}>
                            <UserOutlined />
                          </Avatar>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold' }}>{user.realName}</div>
                            <div style={{ fontSize: 12, color: '#999' }}>
                              @{user.username}
                              {user.village && (
                                <span>
                                  {' '}
                                  - {user.village.town.name} / {user.village.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {getRoleLabel(user.roles)}
                          </Text>
                        </Space>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </Modal>
  )
}
