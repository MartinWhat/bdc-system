'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, Typography, Tag, Space, Button, Spin } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, UserOutlined, EyeOutlined } from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'

const { Title, Text } = Typography

const typeLabels = {
  SYSTEM: '系统通知',
  POLICY: '政策文件',
  ANNOUNCEMENT: '公告',
}

const priorityLabels = {
  LOW: '低',
  NORMAL: '普通',
  HIGH: '高',
  URGENT: '紧急',
}

const priorityColors = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
}

interface NotificationDetail {
  id: string
  title: string
  content: string
  type: 'SYSTEM' | 'POLICY' | 'ANNOUNCEMENT'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  isPopup: boolean
  isPinned: boolean
  readCount: number
  publishedAt?: string
  createdAt: string
  author: {
    id: string
    realName: string
  }
}

export default function NotificationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<NotificationDetail | null>(null)

  const id = params.id as string

  useEffect(() => {
    if (id) {
      fetchNotification()
    }
  }, [id])

  const fetchNotification = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/notifications/${id}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        setNotification(data.data)
      }
    } catch (error) {
      console.error('Fetch notification error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <PageContainer title="通知详情">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    )
  }

  if (!notification) {
    return (
      <PageContainer title="通知详情">
        <Card>
          <Text>通知不存在</Text>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="通知详情"
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          返回
        </Button>
      }
    >
      <Card>
        <div style={{ maxWidth: 800 }}>
          <div style={{ marginBottom: 16 }}>
            <Space size={4} style={{ marginBottom: 8 }}>
              {notification.isPinned && <Tag color="gold">置顶</Tag>}
              {notification.isPopup && <Tag color="orange">弹窗提醒</Tag>}
              <Tag color={priorityColors[notification.priority]}>
                {priorityLabels[notification.priority]}
              </Tag>
              <Tag
                color={
                  notification.type === 'SYSTEM'
                    ? 'blue'
                    : notification.type === 'POLICY'
                      ? 'purple'
                      : 'cyan'
                }
              >
                {typeLabels[notification.type]}
              </Tag>
            </Space>
            <Title level={4} style={{ margin: '8px 0' }}>
              {notification.title}
            </Title>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 24,
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Space>
              <UserOutlined />
              <Text type="secondary">{notification.author?.realName || '-'}</Text>
            </Space>
            <Space>
              <CalendarOutlined />
              <Text type="secondary">
                {notification.publishedAt
                  ? new Date(notification.publishedAt).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '-'}
              </Text>
            </Space>
            <Space>
              <EyeOutlined />
              <Text type="secondary">{notification.readCount} 次阅读</Text>
            </Space>
          </div>

          <div
            className="notification-content"
            dangerouslySetInnerHTML={{ __html: notification.content }}
            style={{
              fontSize: 15,
              lineHeight: 1.8,
              color: 'rgba(0, 0, 0, 0.85)',
            }}
          />
        </div>
      </Card>

      <style jsx global>{`
        .notification-content p {
          margin-bottom: 12px;
        }
        .notification-content img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </PageContainer>
  )
}
