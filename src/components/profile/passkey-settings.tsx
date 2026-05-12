'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Passkey } from '@better-auth/passkey'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  Grid,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { authClient } from '@/lib/auth/auth-client'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

interface PasskeyFormValues {
  name?: string
  authenticatorAttachment: 'platform' | 'cross-platform'
}

function formatDateTime(value?: string | Date) {
  if (!value) {
    return '-'
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function getDeviceTypeLabel(deviceType?: string) {
  const normalized = (deviceType || '').toLowerCase()
  if (normalized.includes('multi')) return '同步设备'
  if (normalized.includes('single')) return '本地设备'
  return deviceType || '未知设备'
}

export default function PasskeySettings() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(false)
  const [addVisible, setAddVisible] = useState(false)
  const [renameVisible, setRenameVisible] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [editingPasskey, setEditingPasskey] = useState<Passkey | null>(null)
  const [addForm] = Form.useForm<PasskeyFormValues>()
  const [renameForm] = Form.useForm<{ name: string }>()

  const loadPasskeys = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authFetch('/api/auth/passkey/list-user-passkeys')
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        const errorMessage = payload?.error || payload?.message || '加载 Passkey 失败'
        message.error(errorMessage)
        return
      }

      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.passkeys)
            ? payload.passkeys
            : []

      setPasskeys(list)
    } catch (error) {
      console.error('Load passkeys error:', error)
      message.error('加载 Passkey 失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPasskeys()
  }, [loadPasskeys])

  const openAddModal = () => {
    addForm.resetFields()
    addForm.setFieldsValue({
      authenticatorAttachment: 'platform',
    })
    setAddVisible(true)
  }

  const closeAddModal = () => {
    setAddVisible(false)
    addForm.resetFields()
  }

  const closeRenameModal = () => {
    setRenameVisible(false)
    setEditingPasskey(null)
    renameForm.resetFields()
  }

  const handleAddPasskey = async (values: PasskeyFormValues) => {
    setAddLoading(true)
    try {
      const result = await authClient.passkey.addPasskey(
        {
          name: values.name?.trim(),
          authenticatorAttachment: values.authenticatorAttachment,
          useAutoRegister: true,
        },
        {
          credentials: 'include',
        },
      )

      if (result.error) {
        message.error(result.error.message || '添加 Passkey 失败')
        return
      }

      message.success('Passkey 已添加')
      closeAddModal()
      await loadPasskeys()
    } catch (error) {
      console.error('Add passkey error:', error)
      message.error('添加 Passkey 失败，请稍后重试')
    } finally {
      setAddLoading(false)
    }
  }

  const openRenameModal = (passkey: Passkey) => {
    setEditingPasskey(passkey)
    renameForm.setFieldsValue({
      name: passkey.name || '',
    })
    setRenameVisible(true)
  }

  const handleRenamePasskey = async (values: { name: string }) => {
    if (!editingPasskey) {
      return
    }

    const name = values.name.trim()
    if (!name) {
      message.error('请输入 Passkey 名称')
      return
    }

    setRenameLoading(true)
    try {
      const response = await authFetch('/api/auth/passkey/update-passkey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingPasskey.id,
          name,
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        message.error(payload?.error || payload?.message || '更新 Passkey 失败')
        return
      }

      message.success('Passkey 名称已更新')
      closeRenameModal()
      await loadPasskeys()
    } catch (error) {
      console.error('Rename passkey error:', error)
      message.error('更新 Passkey 失败，请稍后重试')
    } finally {
      setRenameLoading(false)
    }
  }

  const handleDeletePasskey = async (passkeyId: string) => {
    setDeleteLoadingId(passkeyId)
    try {
      const response = await authFetch('/api/auth/passkey/delete-passkey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: passkeyId,
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        message.error(payload?.error || payload?.message || '删除 Passkey 失败')
        return
      }

      message.success('Passkey 已删除')
      await loadPasskeys()
    } catch (error) {
      console.error('Delete passkey error:', error)
      message.error('删除 Passkey 失败，请稍后重试')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  return (
    <>
      <Card
        title="Passkey 认证"
        size={isMobile ? 'small' : undefined}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            添加 Passkey
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="支持指纹、Face ID、系统 PIN 和安全密钥"
            description="Passkey 可以作为更安全、更省事的登录方式，也适合没有扫码条件的设备。"
          />

          {passkeys.length === 0 && !loading ? (
            <Empty description="当前还没有注册 Passkey" />
          ) : (
            <List
              loading={loading}
              dataSource={passkeys}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="edit"
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => openRenameModal(item)}
                    >
                      重命名
                    </Button>,
                    <Popconfirm
                      key="delete"
                      title="确定删除这个 Passkey 吗？"
                      description="删除后，这个设备将无法再用于登录。"
                      onConfirm={() => void handleDeletePasskey(item.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        loading={deleteLoadingId === item.id}
                      >
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<KeyOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                    title={
                      <Space wrap size={8}>
                        <Text strong>{item.name || '未命名 Passkey'}</Text>
                        <Tag color="blue">{getDeviceTypeLabel(item.deviceType)}</Tag>
                        <Tag color={item.backedUp ? 'green' : 'default'}>
                          {item.backedUp ? '已备份' : '未备份'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4}>
                        <Text type="secondary">创建时间：{formatDateTime(item.createdAt)}</Text>
                        <Text type="secondary">凭证 ID：{item.credentialID}</Text>
                        {item.transports ? (
                          <Text type="secondary">传输方式：{item.transports}</Text>
                        ) : null}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Space>
      </Card>

      <Modal
        title="添加 Passkey"
        open={addVisible}
        onCancel={closeAddModal}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Form
          form={addForm}
          layout="vertical"
          onFinish={handleAddPasskey}
          initialValues={{ authenticatorAttachment: 'platform' }}
        >
          <Alert
            type="success"
            showIcon
            message="开始注册新的 Passkey"
            description="系统会调用浏览器或设备的生物识别能力，完成后可直接用于登录。"
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="name"
            label="Passkey 名称"
            extra="例如：办公电脑、iPhone 面容 ID、YubiKey"
          >
            <Input placeholder="请输入 Passkey 名称" />
          </Form.Item>

          <Form.Item
            name="authenticatorAttachment"
            label="设备类型"
            rules={[{ required: true, message: '请选择设备类型' }]}
          >
            <Select
              options={[
                { label: '平台设备（推荐）', value: 'platform' },
                { label: '跨平台安全密钥', value: 'cross-platform' },
              ]}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
              <Button onClick={closeAddModal} block={isMobile}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={addLoading} block={isMobile}>
                创建 Passkey
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="重命名 Passkey"
        open={renameVisible}
        onCancel={closeRenameModal}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Form form={renameForm} layout="vertical" onFinish={handleRenamePasskey}>
          <Form.Item
            name="name"
            label="Passkey 名称"
            rules={[{ required: true, message: '请输入 Passkey 名称' }]}
          >
            <Input placeholder="请输入新的名称" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
              <Button onClick={closeRenameModal} block={isMobile}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={renameLoading} block={isMobile}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
