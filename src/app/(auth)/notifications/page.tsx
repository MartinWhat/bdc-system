'use client'

import PageContainer from '@/components/PageContainer'
import NotificationList from '@/components/notifications/NotificationList'

export default function NotificationsPage() {
  return (
    <PageContainer title="通知公告" subTitle="查看系统通知、政策文件和公告">
      <NotificationList />
    </PageContainer>
  )
}
