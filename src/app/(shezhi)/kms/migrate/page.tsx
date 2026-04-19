'use client'

import { useState, useEffect } from 'react'
import {
  Typography,
  Card,
  Form,
  Select,
  Button,
  Progress,
  Alert,
  Space,
  message,
  Descriptions,
  Row,
  Col,
} from 'antd'
import { KeyOutlined, SyncOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'

const { Title } = Typography
const { Option } = Select

interface Key {
  id: string
  keyType: string
  version: number
  isActive: boolean
  isArchived?: boolean
  deletedAt?: string | null
  encryptedDataCount: number
}

export default function KmsMigratePage() {
  const [form] = Form.useForm()
  const [keys, setKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ migrated: number; failed: number } | null>(null)

  // 加载密钥列表
  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    try {
      const res = await authFetch('/api/kms/keys')
      const data = await res.json()
      if (data.success) {
        setKeys(data.data.filter((k: Key) => !k.isArchived && !k.deletedAt))
      }
    } catch (error) {
      console.error('Load keys error:', error)
    }
  }

  // 执行迁移
  const handleMigrate = async (values: any) => {
    setMigrating(true)
    setResult(null)
    setProgress(0)

    try {
      // 模拟进度更新
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval)
            return 90
          }
          return prev + 10
        })
      }, 500)

      const res = await authFetch('/api/kms/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      })

      clearInterval(interval)
      const data = await res.json()

      if (data.success) {
        setProgress(100)
        setResult(data.data)
        message.success('迁移完成')
      } else {
        message.error(data.error)
        setProgress(0)
      }
    } catch (error) {
      message.error('迁移失败')
      setProgress(0)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <SyncOutlined spin={migrating} style={{ marginRight: 8 }} />
        密钥数据迁移
      </Title>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="迁移配置" bordered={false}>
            <Form form={form} layout="vertical" onFinish={handleMigrate}>
              <Form.Item
                name="oldKeyId"
                label="源密钥（旧密钥）"
                rules={[{ required: true, message: '请选择源密钥' }]}
              >
                <Select placeholder="选择要迁移的旧密钥">
                  {keys
                    .filter((k) => !k.isActive)
                    .map((k) => (
                      <Option key={k.id} value={k.id}>
                        {k.keyType} v{k.version} - {k.encryptedDataCount || 0} 条数据
                      </Option>
                    ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="newKeyId"
                label="目标密钥（新密钥）"
                rules={[{ required: true, message: '请选择目标密钥' }]}
              >
                <Select placeholder="选择新的密钥">
                  {keys
                    .filter((k) => k.isActive)
                    .map((k) => (
                      <Option key={k.id} value={k.id}>
                        {k.keyType} v{k.version} (活跃)
                      </Option>
                    ))}
                </Select>
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={migrating}
                    icon={<SyncOutlined spin={migrating} />}
                  >
                    开始迁移
                  </Button>
                  <Button onClick={() => form.resetFields()} disabled={migrating}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="迁移进度" bordered={false}>
            {migrating || result ? (
              <>
                <Progress
                  percent={progress}
                  status={progress === 100 ? 'success' : 'active'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                />
                {result && (
                  <Alert
                    message="迁移完成"
                    description={
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="成功">{result.migrated} 条</Descriptions.Item>
                        <Descriptions.Item label="失败">{result.failed} 条</Descriptions.Item>
                      </Descriptions>
                    }
                    type="success"
                    showIcon
                    style={{ marginTop: 16 }}
                  />
                )}
              </>
            ) : (
              <Alert
                message="提示"
                description="选择源密钥和目标密钥后，点击开始迁移按钮执行数据迁移。迁移过程中会将旧密钥加密的数据重新加密到新密钥。"
                type="info"
                showIcon
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
