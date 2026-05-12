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
  Row,
  Col,
  message,
  Space,
  Tag,
  Popconfirm,
  Pagination,
  Typography,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

const phonePattern = /^1\d{10}$/
const fixedPhonePattern = /^[0-9()+\-\s]{5,20}$/

interface User {
  id: string
  username: string
  realName: string
  email?: string
  fixedPhone?: string
  status: string
  twoFactorEnabled: boolean
  lastLoginAt?: string
  createdAt: string
  roles: Array<{
    role: {
      id: string
      name: string
      code: string
    }
  }>
}

interface Role {
  id: string
  name: string
  code: string
}

interface UserFormValues {
  username?: string
  password?: string
  realName: string
  phone: string
  fixedPhone?: string
  email?: string
  roleIds?: string[]
}

export default function UsersPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const openCreateModal = () => {
    setEditingUser(null)
    form.resetFields()
    setModalVisible(true)
  }

  const openEditModal = (record: User) => {
    setEditingUser(record)
    form.resetFields()
    form.setFieldsValue({
      ...record,
      roleIds: record.roles.map((ur) => ur.role.id),
    })
    setModalVisible(true)
  }

  const normalizeOptionalString = (value?: string) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  }

  const generateRandomPassword = (length = 12) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*'
    const randomValues = new Uint32Array(length)

    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(randomValues)
      return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')
    }

    return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
      '',
    )
  }

  const handleGeneratePassword = () => {
    const password = generateRandomPassword()
    form.setFieldValue('password', password)
    message.success('已生成随机密码')
  }

  const showCreatedUserConfirm = (username: string, password: string) => {
    Modal.confirm({
      title: '创建成功',
      centered: true,
      icon: null,
      okCancel: false,
      okText: '我已记录',
      content: (
        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
          <div style={{ marginBottom: 12, color: 'rgba(0, 0, 0, 0.65)' }}>请确认以下账号信息</div>
          <div style={{ marginBottom: 10 }}>
            <Text type="secondary">用户名</Text>
            <div>
              <Text strong copyable>
                {username}
              </Text>
            </div>
          </div>
          <div>
            <Text type="secondary">密码</Text>
            <div>
              <Text strong code copyable>
                {password}
              </Text>
            </div>
          </div>
        </div>
      ),
    })
  }

  // 加载用户列表
  const loadUsers = useCallback(async (page = 1, size = 10) => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/users?page=${page}&pageSize=${size}`)
      const data = await res.json()
      console.log('[Users] Load result:', data)
      if (data.success) {
        setUsers(data.data.list)
        setTotal(data.data.total)
      } else {
        console.error('[Users] Load failed:', data.error)
        message.error(data.error || '加载失败')
      }
    } catch {
      console.error('[Users] Load error')
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 加载角色列表
  const loadRoles = useCallback(async () => {
    try {
      const res = await authFetch('/api/roles')
      const data = await res.json()
      console.log('[Roles] Load result:', data)
      if (data.success) {
        setRoles(data.data)
      } else {
        console.error('[Roles] Load failed:', data.error)
        message.error(data.error || '加载失败')
      }
    } catch {
      console.error('[Roles] Load error')
      message.error('加载角色失败')
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [loadUsers, loadRoles])

  // 创建/编辑用户
  const handleSubmit = async (values: UserFormValues) => {
    setSubmitting(true)
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'
      const payload = editingUser
        ? {
            realName: values.realName.trim(),
            fixedPhone: values.fixedPhone?.trim() ?? '',
            email: normalizeOptionalString(values.email),
            roleIds: values.roleIds,
          }
        : {
            username: values.username?.trim(),
            password: values.password,
            realName: values.realName.trim(),
            phone: values.phone.trim(),
            fixedPhone: normalizeOptionalString(values.fixedPhone),
            email: normalizeOptionalString(values.email),
            roleIds: values.roleIds,
          }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingUser ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingUser(null)
        loadUsers()
        if (!editingUser) {
          const createdUsername = String(payload.username || '')
          const createdPassword = String(payload.password || '')
          showCreatedUserConfirm(createdUsername, createdPassword)
        }
      } else {
        message.error(data.error)
      }
    } catch {
      console.error('Submit error')
      message.error('操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisable = async (id: string) => {
    try {
      const res = await authFetch(`/api/users/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('已禁用')
        loadUsers(currentPage, pageSize)
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('禁用失败')
    }
  }

  const handleEnable = async (id: string) => {
    try {
      const res = await authFetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('已启用')
        loadUsers(currentPage, pageSize)
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('启用失败')
    }
  }

  const handlePermanentDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/users/${id}/purge`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('已彻底删除')
        loadUsers(currentPage, pageSize)
      } else {
        message.error(data.error)
      }
    } catch {
      message.error('彻底删除失败')
    }
  }

  const renderActions = (record: User) =>
    isMobile ? (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Button block size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
          编辑
        </Button>
        {record.status === 'ACTIVE' ? (
          <Popconfirm
            title="确认禁用"
            description="禁用后可随时启用"
            onConfirm={() => handleDisable(record.id)}
          >
            <Button block size="small" danger icon={<LockOutlined />}>
              禁用
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="确认启用"
            description="启用后用户可继续登录系统"
            onConfirm={() => handleEnable(record.id)}
          >
            <Button block size="small" type="primary" icon={<UnlockOutlined />}>
              启用
            </Button>
          </Popconfirm>
        )}
        {record.status === 'DISABLED' && (
          <Popconfirm
            title="确认彻底删除"
            description="将删除账号、会话、日志和该用户创建的通知，无法恢复"
            onConfirm={() => handlePermanentDelete(record.id)}
          >
            <Button block size="small" danger icon={<DeleteOutlined />}>
              彻底删除
            </Button>
          </Popconfirm>
        )}
      </Space>
    ) : (
      <Space wrap size={isMobile ? 6 : 8}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
          编辑
        </Button>
        {record.status === 'ACTIVE' ? (
          <Popconfirm
            title="确认禁用"
            description="禁用后可随时启用"
            onConfirm={() => handleDisable(record.id)}
          >
            <Button size="small" danger icon={<LockOutlined />}>
              禁用
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="确认启用"
            description="启用后用户可继续登录系统"
            onConfirm={() => handleEnable(record.id)}
          >
            <Button size="small" type="primary" icon={<UnlockOutlined />}>
              启用
            </Button>
          </Popconfirm>
        )}
        {record.status === 'DISABLED' && (
          <Popconfirm
            title="确认彻底删除"
            description="将删除账号、会话、日志和该用户创建的通知，无法恢复"
            onConfirm={() => handlePermanentDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              彻底删除
            </Button>
          </Popconfirm>
        )}
      </Space>
    )

  const renderMobileCard = (record: User) => (
    <Card key={record.id} size="small" style={{ borderRadius: 12 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{record.realName}</Text>
          <Tag color={record.status === 'ACTIVE' ? 'green' : 'red'}>
            {record.status === 'ACTIVE' ? '启用' : '禁用'}
          </Tag>
        </Space>
        <Space direction="vertical" size={2} style={{ width: '100%', minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.username}
          </Text>
          <Text
            type="secondary"
            style={{
              fontSize: 12,
              display: 'block',
              width: '100%',
              minWidth: 0,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            {record.email || '无邮箱'}
          </Text>
        </Space>
        <Space size={6} wrap>
          {record.roles.map((ur) => (
            <Tag key={ur.role.id} color="blue">
              {ur.role.name}
            </Tag>
          ))}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          最后登录：
          {record.lastLoginAt ? new Date(record.lastLoginAt).toLocaleString() : '从未登录'}
        </Text>
        {record.fixedPhone && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            固定电话：{record.fixedPhone}
          </Text>
        )}
        {renderActions(record)}
      </Space>
    </Card>
  )

  const columns: ColumnsType<User> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '真实姓名',
      dataIndex: 'realName',
      key: 'realName',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '固定电话',
      dataIndex: 'fixedPhone',
      key: 'fixedPhone',
      render: (text: string) => text || '无',
    },
    {
      title: '角色',
      key: 'roles',
      render: (_, record) => (
        <Space>
          {record.roles.map((ur) => (
            <Tag key={ur.role.id} color="blue">
              {ur.role.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>
          {status === 'ACTIVE' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (text: string) => (text ? new Date(text).toLocaleString() : '从未登录'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => renderActions(record),
    },
  ]

  return (
    <PageContainer
      title="用户管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} block={isMobile} onClick={openCreateModal}>
          创建用户
        </Button>
      }
      dataSource={users}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无用户数据"
    >
      {isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {users.map(renderMobileCard)}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              onChange={(page) => {
                setCurrentPage(page)
                loadUsers(page, pageSize)
              }}
            />
          </div>
        </Space>
      ) : (
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
              loadUsers(page, size)
            },
          }}
        />
      )}

      <Modal
        title={editingUser ? '编辑用户' : '创建用户'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingUser(null)
          form.resetFields()
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 720}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} scrollToFirstError>
          {!editingUser ? (
            <>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, max: 20, message: '用户名长度需在 3-20 个字符之间' },
                      {
                        pattern: /^[a-zA-Z0-9_]+$/,
                        message: '用户名只能包含字母、数字和下划线',
                      },
                    ]}
                  >
                    <Input placeholder="请输入登录用户名" autoComplete="off" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="realName"
                    label="真实姓名"
                    rules={[
                      { required: true, message: '请输入真实姓名' },
                      { max: 50, message: '真实姓名不能超过 50 个字符' },
                    ]}
                  >
                    <Input placeholder="请输入真实姓名" maxLength={50} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少 6 位' },
                      { max: 64, message: '密码不能超过 64 个字符' },
                    ]}
                  >
                    <Input.Password
                      placeholder="请输入初始密码"
                      autoComplete="new-password"
                      addonAfter={
                        <Button type="link" size="small" onClick={handleGeneratePassword}>
                          随机生成
                        </Button>
                      }
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="phone"
                    label="手机号"
                    rules={[
                      { required: true, message: '请输入手机号' },
                      {
                        validator: (_, value) => {
                          if (!value) return Promise.resolve()
                          return phonePattern.test(value)
                            ? Promise.resolve()
                            : Promise.reject(new Error('请输入正确的手机号'))
                        },
                      },
                    ]}
                  >
                    <Input placeholder="请输入手机号" maxLength={11} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="fixedPhone"
                    label="固定电话"
                    rules={[
                      {
                        validator: (_, value) => {
                          if (!value) return Promise.resolve()
                          return fixedPhonePattern.test(value)
                            ? Promise.resolve()
                            : Promise.reject(new Error('请输入正确的固定电话'))
                        },
                      },
                    ]}
                  >
                    <Input allowClear placeholder="请输入固定电话（可选）" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { type: 'email', message: '请输入有效的邮箱地址' },
                      { max: 50, message: '邮箱地址不能超过 50 个字符' },
                    ]}
                  >
                    <Input placeholder="请输入邮箱（可选）" maxLength={50} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name="roleIds" label="角色">
                    <Select
                      mode="multiple"
                      placeholder="选择角色（可选）"
                      allowClear
                      showSearch
                      optionFilterProp="children"
                    >
                      {roles.map((role) => (
                        <Select.Option key={role.id} value={role.id}>
                          {role.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                创建后账号默认启用，手机号为必填联系信息。
              </Text>
            </>
          ) : (
            <>
              <Form.Item
                name="realName"
                label="真实姓名"
                rules={[
                  { required: true, message: '请输入真实姓名' },
                  { max: 50, message: '真实姓名不能超过 50 个字符' },
                ]}
              >
                <Input placeholder="请输入真实姓名" maxLength={50} />
              </Form.Item>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' },
                  { max: 50, message: '邮箱地址不能超过 50 个字符' },
                ]}
              >
                <Input placeholder="请输入邮箱（可选）" maxLength={50} />
              </Form.Item>
              <Form.Item
                name="fixedPhone"
                label="固定电话"
                rules={[
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve()
                      return fixedPhonePattern.test(value)
                        ? Promise.resolve()
                        : Promise.reject(new Error('请输入正确的固定电话'))
                    },
                  },
                ]}
              >
                <Input allowClear placeholder="请输入固定电话（可选）" maxLength={20} />
              </Form.Item>
              <Form.Item name="roleIds" label="角色">
                <Select
                  mode="multiple"
                  placeholder="选择角色（可选）"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {roles.map((role) => (
                    <Select.Option key={role.id} value={role.id}>
                      {role.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              {editingUser ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
