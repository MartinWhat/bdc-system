'use client'

import React, { useEffect } from 'react'
import { List, Typography, Tag, Space, Spin, Empty } from 'antd'
import { BellOutlined, RightOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useNotificationStore, NotificationItem } from '@/lib/store/notification'
import { authFetch } from '@/lib/api-fetch'
import { useAuthStore } from '@/lib/store/auth'
import { readNotificationCardCache, writeNotificationCardCache } from '@/lib/notification-cache'
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
  const userId = useAuthStore((state) => state.user?.id)
  const { loadReadIds, setPopupQueue, showNextPopup, isRead } = useNotificationStore()
  const [loading, setLoading] = React.useState(false)
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])

  useEffect(() => {
    loadReadIds()
  }, [loadReadIds])

  useEffect(() => {
    let cancelled = false

    const loadNotifications = async () => {
      if (!userId) {
        return
      }

      const cached = userId ? readNotificationCardCache(userId) : null
      if (cached) {
        setNotifications(cached.list)
        setLoading(false)

        if (cached.isFresh) {
          return
        }
      } else {
        setLoading(true)
      }

      try {
        const res = await authFetch('/api/notifications?pageSize=5&status=PUBLISHED')
        const data = await res.json()
        if (!cancelled && data.success) {
          setNotifications(data.data.list)
          if (userId) {
            writeNotificationCardCache(userId, data.data.list)
          }
        }
      } catch (error) {
        console.error('Fetch notifications error:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadNotifications()

    return () => {
      cancelled = true
    }
  }, [userId])

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
  }, [setPopupQueue, showNextPopup])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const handleClick = (id: string) => {
    router.push(`/notifications/${id}`)
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.iconWrap}>
            <BellOutlined />
          </div>
          <div className={styles.headingText}>
            <div className={styles.titleRow}>
              <Text className={styles.title}>通知公告</Text>
              <span className={styles.badge}>{notifications.length} 条</span>
            </div>
          </div>
        </div>
        <a className={styles.link} onClick={() => router.push('/notifications')}>
          查看全部 <RightOutlined />
        </a>
      </div>

      <Spin spinning={loading}>
        {notifications.length > 0 ? (
          <List
            className={styles.list}
            dataSource={notifications}
            split={false}
            renderItem={(item) => (
              <List.Item
                className={`${styles.item} ${isRead(item.id) ? styles.read : ''}`}
                onClick={() => handleClick(item.id)}
              >
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <Space size={6} wrap>
                      {item.priority === 'URGENT' && <Tag color="red">紧急</Tag>}
                      <Tag color={priorityColors[item.priority]}>{typeLabels[item.type]}</Tag>
                    </Space>
                    <Space size={4} className={styles.dateWrap}>
                      <ClockCircleOutlined />
                      <Text type="secondary" className={styles.date}>
                        {formatDate(item.publishedAt)}
                      </Text>
                    </Space>
                  </div>
                  <Text className={styles.itemTitle} ellipsis={{ tooltip: item.title }}>
                    {item.title}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty
            className={styles.empty}
            description="暂无通知公告"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Spin>
    </section>
  )
}

export default NotificationCard
