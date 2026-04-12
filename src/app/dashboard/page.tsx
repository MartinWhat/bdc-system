'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { useRouter } from 'next/navigation'
import { Layout, Typography, Card, Row, Col, Statistic } from 'antd'
import { UserOutlined, HomeOutlined, FileTextOutlined, BarChartOutlined } from '@ant-design/icons'

const { Header, Content } = Layout
const { Title } = Typography

export default function DashboardPage() {
  const { user, loadFromStorage } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    loadFromStorage()

    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
    }
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            不动产证书管理系统
          </Title>
          <div>
            <UserOutlined /> {user?.realName || user?.username}
          </div>
        </div>
      </Header>

      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={3}>工作台</Title>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="用户管理" value={0} prefix={<UserOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="宅基地档案" value={0} prefix={<HomeOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="领证记录" value={0} prefix={<FileTextOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="统计报表" value={0} prefix={<BarChartOutlined />} />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  )
}
