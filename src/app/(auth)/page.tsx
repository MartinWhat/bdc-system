'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { Card, Row, Col, Statistic, Typography } from 'antd'
import { UserOutlined, HomeOutlined, FileTextOutlined, BarChartOutlined } from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import NotificationCard from '@/components/notifications/NotificationCard'
import NotificationPopup from '@/components/notifications/NotificationPopup'
import { MotionCard, MotionContainer } from '@/components/motion'

const { Text } = Typography

export default function DashboardPage() {
  const { user } = useAuthStore()

  // 显示用户名
  const displayName = user?.realName || user?.username || '加载中...'

  return (
    <MotionContainer>
      <PageContainer title="工作台" subTitle={`欢迎回来，${displayName}`}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard>
              <Statistic title="用户总数" value={0} prefix={<UserOutlined />} />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard>
              <Statistic title="宅基地档案" value={0} prefix={<HomeOutlined />} />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard>
              <Statistic title="领证记录" value={0} prefix={<FileTextOutlined />} />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard>
              <Statistic title="待处理事项" value={0} prefix={<BarChartOutlined />} />
            </MotionCard>
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <MotionCard>
              <NotificationCard />
            </MotionCard>
          </Col>
        </Row>
        <NotificationPopup />
      </PageContainer>
    </MotionContainer>
  )
}
