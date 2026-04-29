'use client'

import { Modal, Typography, Button, Space, Tag } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useNotificationStore } from '@/lib/store/notification'
import { useAuthStore } from '@/lib/store/auth'
import { authFetch } from '@/lib/api-fetch'
import styles from './NotificationPopup.module.css'

const { Title, Text } = Typography

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

export function NotificationPopup() {
  const { currentPopup, popupVisible, closePopup } = useNotificationStore()
  const { user } = useAuthStore()

  const handleClose = async () => {
    if (currentPopup) {
      // 标记已读
      try {
        // 从 auth store 获取用户 ID，不从 cookie 读取
        const userId = user?.id || 'anonymous'

        await authFetch(`/api/notifications/${currentPopup.id}/read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        })
      } catch (error) {
        console.error('Mark read error:', error)
      }
    }
    closePopup()
  }

  if (!currentPopup) return null

  return (
    <Modal
      open={popupVisible}
      onCancel={handleClose}
      footer={[
        <Button key="close" type="primary" onClick={handleClose}>
          我已知晓
        </Button>,
      ]}
      width={520}
      centered
      mask={{ closable: false }}
      className={styles.popup}
    >
      <div className={styles.header}>
        <BellOutlined className={styles.bellIcon} />
        <Title level={5} className={styles.title}>
          {currentPopup.title}
        </Title>
        <Space>
          <Tag color={priorityColors[currentPopup.priority]}>{typeLabels[currentPopup.type]}</Tag>
          {currentPopup.priority === 'URGENT' && <Tag color="red">紧急</Tag>}
        </Space>
      </div>
      <div className={styles.content} dangerouslySetInnerHTML={{ __html: currentPopup.content }} />
    </Modal>
  )
}

export default NotificationPopup
