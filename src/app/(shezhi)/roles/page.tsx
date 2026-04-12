'use client'

import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Transfer, message, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

interface Role {
  id: string
  name: string
  code: string
  description?: string
  status: string
  permissions: Array<{
    permission: {
      id: string
      name: string
      code: string
      type: string
    }
  }>
  _count: {
    users: number
  }
}

interface Permission {
  id: string
  name: string
  code: string
  type: string
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [form] = Form.useForm()

  // 加载角色列表
  const loadRoles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/roles')
      const data = await res.json()
      if (data.success) {
        setRoles(data.data)
      }
    } catch (error) {
      message.error('加载角色列表失败')
    } finally {
      setLoading(false)
    }
  }

  // 加载权限列表
  const loadPermissions = async () => {
    try {
      const res = await fetch('/api/permissions')
      const data = await res.json()
      if (data.success) {
        setPermissions(data.data)
      }
    } catch (error) {
      console.error('加载权限失败')
    }
  }

  useEffect(() => {
    loadRoles()
    loadPermissions()
  }, [])

  // 创建/编辑角色
  const handleSubmit = async (values: any) => {
    try {
      const url = editingRole ? `/api/roles/${editingRole.id}` : '/api/roles'
      const method = editingRole ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingRole ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingRole(null)
        loadRoles()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  // 删除角色
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/roles/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadRoles()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns: ColumnsType<Role> = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '角色代码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '权限数',
      key: 'permissions',
      render: (_, record) => `${record.permissions.length} 个权限`,
    },
    {
      title: '用户数',
      key: 'users',
      render: (_, record) => `${record._count.users} 个用户`,
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
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRole(record)
              form.setFieldsValue({
                name: record.name,
                code: record.code,
                description: record.description,
                status: record.status,
                permissionIds: record.permissions.map((p) => p.permission.id),
              })
              setModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除前请确保该角色下没有用户"
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
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>角色管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingRole(null)
            form.resetFields()
            setModalVisible(true)
          }}
        >
          创建角色
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={roles}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingRole ? '编辑角色' : '创建角色'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingRole(null)
          form.resetFields()
        }}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input />
          </Form.Item>
          {!editingRole && (
            <Form.Item
              name="code"
              label="角色代码"
              rules={[{ required: true, message: '请输入角色代码' }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="permissionIds" label="权限分配">
            <Transfer
              dataSource={permissions.map((p) => ({
                key: p.id,
                title: `${p.name} (${p.code})`,
              }))}
              titles={['可选权限', '已选权限']}
              render={(item) => item.title}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingRole ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
