'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { useRouter } from 'next/navigation'
import { Card, Row, Col, Statistic, Typography } from 'antd'
import { UserOutlined, HomeOutlined, FileTextOutlined, BarChartOutlined } from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'

const { Text } = Typography

export default function DashboardPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    loadFromStorage()
  }, [])

  return (
    <PageContainer title="工作台" subTitle={`欢迎回来，${user?.realName || user?.username}`}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="用户总数" value={0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="宅基地档案" value={0} prefix={<HomeOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="领证记录" value={0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic title="待处理事项" value={0} prefix={<BarChartOutlined />} />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  )
}
