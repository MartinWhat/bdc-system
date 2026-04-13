'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Tag,
  Popconfirm,
  Typography,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageContainer from '@/components/PageContainer'

const { Text } = Typography

interface User {
  id: string
  username: string
  realName: string
  email?: string
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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 加载用户列表
  const loadUsers = useCallback(async (page = 1, size = 10) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/users?page=${page}&pageSize=${size}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        setUsers(data.data.list)
        setTotal(data.data.total)
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load users error:', error)
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 加载角色列表
  const loadRoles = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/roles', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        setRoles(data.data)
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load roles error:', error)
      message.error('加载角色失败')
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  // 创建/编辑用户
  const handleSubmit = async (values: {
    username: string
    password?: string
    realName: string
    email?: string
    roleIds?: string[]
  }) => {
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingUser ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingUser(null)
        loadUsers()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Submit error:', error)
      message.error('操作失败')
    }
  }

  // 删除用户
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadUsers()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

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
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingUser(record)
              form.setFieldsValue(record)
              setModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后将禁用该用户账号"
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
      title="用户管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingUser(null)
            form.resetFields()
            setModalVisible(true)
          }}
        >
          创建用户
        </Button>
      }
      dataSource={users}
      loading={loading}
      emptyDescription="暂无用户数据"
    >
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

      <Modal
        title={editingUser ? '编辑用户' : '创建用户'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingUser(null)
          form.resetFields()
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingUser && (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, max: 20, message: '用户名长度需在 3-20 个字符之间' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6位' },
                ]}
              >
                <Input.Password />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="realName"
            label="真实姓名"
            rules={[{ required: true, message: '请输入真实姓名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' },
              { max: 50, message: '邮箱地址不能超过 50 个字符' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="roleIds" label="角色">
            <Select mode="multiple" placeholder="选择角色">
              {roles.map((role) => (
                <Select.Option key={role.id} value={role.id}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingUser ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
