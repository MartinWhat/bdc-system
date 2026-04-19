'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  message,
  Descriptions,
  Modal,
  Typography,
  Tag,
} from 'antd'
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'
import PageContainer from '@/components/PageContainer'

const { Title } = Typography

interface UserProfile {
  id: string
  username: string
  realName: string
  email?: string
  phone?: string
  avatar?: string
  status: string
  twoFactorEnabled: boolean
  createdAt: string
  roles: Array<{
    id: string
    name: string
    code: string
  }>
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [changePwdLoading, setChangePwdLoading] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [changePwdModalVisible, setChangePwdModalVisible] = useState(false)
  const [editForm] = Form.useForm()
  const [changePwdForm] = Form.useForm()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/profile')
      const data = await res.json()
      if (data.success) {
        setProfile(data.data)
      } else {
        message.error(data.error || '加载失败')
      }
    } catch (error) {
      console.error('Load profile error:', error)
      message.error('加载个人信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (values: {
    realName: string
    email?: string
    phone?: string
  }) => {
    setEditLoading(true)
    try {
      const res = await authFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (data.success) {
        message.success('个人信息已更新')
        setEditModalVisible(false)
        editForm.resetFields()
        loadProfile()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Update profile error:', error)
      message.error('更新失败')
    } finally {
      setEditLoading(false)
    }
  }

  const handleChangePassword = async (values: {
    oldPassword: string
    newPassword: string
    confirmPassword: string
  }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致')
      return
    }

    setChangePwdLoading(true)
    try {
      const res = await authFetch('/api/profile?action=password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: values.oldPassword,
          newPassword: values.newPassword,
        }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('密码已修改')
        setChangePwdModalVisible(false)
        changePwdForm.resetFields()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Change password error:', error)
      message.error('修改密码失败')
    } finally {
      setChangePwdLoading(false)
    }
  }

  const openEditModal = () => {
    editForm.setFieldsValue({
      realName: profile?.realName,
      email: profile?.email,
      phone: profile?.phone,
    })
    setEditModalVisible(true)
  }

  const openChangePwdModal = () => {
    changePwdForm.resetFields()
    setChangePwdModalVisible(true)
  }

  if (loading) {
    return (
      <PageContainer title="个人信息">
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <div>Loading...</div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="个人信息"
      extra={
        <Space>
          <Button icon={<EditOutlined />} onClick={openEditModal}>
            编辑资料
          </Button>
          <Button icon={<SafetyOutlined />} onClick={openChangePwdModal}>
            修改密码
          </Button>
        </Space>
      }
    >
      <Card loading={loading}>
        <Descriptions
          title="基本信息"
          bordered
          column={{ xxl: 2, xl: 2, lg: 2, md: 2, sm: 1, xs: 1 }}
        >
          <Descriptions.Item label="用户名" span={2}>
            <Space>
              <UserOutlined />
              {profile?.username}
            </Space>
          </Descriptions.Item>

          <Descriptions.Item label="真实姓名" span={2}>
            {profile?.realName || '-'}
          </Descriptions.Item>

          <Descriptions.Item label="邮箱" span={2}>
            <Space>
              <MailOutlined />
              {profile?.email || '-'}
            </Space>
          </Descriptions.Item>

          <Descriptions.Item label="手机号" span={2}>
            <Space>
              <PhoneOutlined />
              {profile?.phone || '-'}
            </Space>
          </Descriptions.Item>

          <Descriptions.Item label="所属角色" span={2}>
            <Space wrap>
              {profile?.roles.map((role) => (
                <Tag key={role.id} color="blue">
                  {role.name}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>

          <Descriptions.Item label="账号状态" span={2}>
            <Tag color={profile?.status === 'ACTIVE' ? 'green' : 'red'}>
              {profile?.status === 'ACTIVE' ? '正常' : '禁用'}
            </Tag>
          </Descriptions.Item>

          <Descriptions.Item label="注册时间" span={2}>
            {profile?.createdAt ? new Date(profile.createdAt).toLocaleString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 编辑资料弹窗 */}
      <Modal
        title="编辑个人资料"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateProfile} autoComplete="off">
          <Form.Item label="用户名" tooltip="用户名不可修改">
            <Input value={profile?.username} disabled />
          </Form.Item>

          <Form.Item
            name="realName"
            label="真实姓名"
            rules={[{ required: true, message: '请输入真实姓名' }]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              {
                type: 'email',
                message: '请输入有效的邮箱地址',
              },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              {
                pattern: /^1[3-9]\d{9}$/,
                message: '请输入正确的手机号',
              },
            ]}
          >
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={editLoading}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={changePwdModalVisible}
        onCancel={() => setChangePwdModalVisible(false)}
        footer={null}
      >
        <Form
          form={changePwdForm}
          layout="vertical"
          onFinish={handleChangePassword}
          autoComplete="off"
        >
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码（至少 6 位）" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setChangePwdModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={changePwdLoading}>
                确认修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
