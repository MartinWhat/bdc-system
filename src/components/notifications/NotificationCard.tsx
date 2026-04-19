'use client'

import React, { useEffect } from 'react'
import { Card, List, Typography, Tag, Space, Spin } from 'antd'
import { BellOutlined, RightOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useNotificationStore, NotificationItem } from '@/lib/store/notification'
import { authFetch } from '@/lib/api-fetch'
import styles from './NotificationCard.module.css'

const { Text } = Typography

const typeLabels = {
  SYSTEM: '系统通知',
  POLICY: '政策文件',
  ANNOUNCEMENT: '公告',
}

const priorityColors = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
}

export function NotificationCard() {
  const router = useRouter()
  const { popupQueue, loadReadIds, setPopupQueue, showNextPopup, isRead } = useNotificationStore()
  const [loading, setLoading] = React.useState(false)
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])

  useEffect(() => {
    loadReadIds()
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/notifications?pageSize=5&status=PUBLISHED')
      const data = await res.json()
      if (data.success) {
        setNotifications(data.data.list)
      }
    } catch (error) {
      console.error('Fetch notifications error:', error)
    } finally {
      setLoading(false)
    }
  }

  // 检查是否有未弹出的弹窗通知
  useEffect(() => {
    const checkPopupNotifications = async () => {
      try {
        const res = await authFetch('/api/notifications/popup')
        const data = await res.json()
        if (data.success && data.data.length > 0) {
          setPopupQueue(data.data)
          showNextPopup()
        }
      } catch (error) {
        console.error('Fetch popup notifications error:', error)
      }
    }
    checkPopupNotifications()
  }, [])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const handleClick = (id: string) => {
    router.push(`/notifications/${id}`)
  }

  return (
    <Card
      className={styles.card}
      title={
        <Space>
          <BellOutlined />
          <span>通知公告</span>
        </Space>
      }
      extra={
        <a onClick={() => router.push('/notifications')}>
          查看全部 <RightOutlined />
        </a>
      }
    >
      <Spin spinning={loading}>
        <List
          className={styles.list}
          dataSource={notifications}
          locale={{ emptyText: '暂无通知公告' }}
          renderItem={(item) => (
            <List.Item
              className={`${styles.item} ${isRead(item.id) ? styles.read : ''}`}
              onClick={() => handleClick(item.id)}
            >
              <div className={styles.itemContent}>
                <div className={styles.itemHeader}>
                  <Space size={4}>
                    {item.priority === 'URGENT' && <Tag color="red">紧急</Tag>}
                    <Tag color={priorityColors[item.priority]}>{typeLabels[item.type]}</Tag>
                  </Space>
                  <Text type="secondary" className={styles.date}>
                    {formatDate(item.publishedAt)}
                  </Text>
                </div>
                <Text className={styles.title} ellipsis={{ tooltip: item.title }}>
                  {item.title}
                </Text>
              </div>
            </List.Item>
          )}
        />
      </Spin>
    </Card>
  )
}

export default NotificationCard
