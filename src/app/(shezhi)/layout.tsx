'use client'

import { useState, useEffect } from 'react'
import { Layout, Menu, Typography, Avatar, Dropdown } from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  HomeOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'

const { Sider, Content, Header } = Layout
const { Title } = Typography

const menuItems = [
  {
    key: '/dashboard',
    icon: <HomeOutlined />,
    label: '工作台',
  },
  {
    key: '/users',
    icon: <TeamOutlined />,
    label: '用户管理',
  },
  {
    key: '/roles',
    icon: <UserOutlined />,
    label: '角色管理',
  },
  {
    key: '/bdc',
    icon: <HomeOutlined />,
    label: '宅基地管理',
  },
  {
    key: '/stats',
    icon: <BarChartOutlined />,
    label: '统计报表',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '系统设置',
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, clearAuth } = useAuthStore()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
    }
  }, [])

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 32,
            margin: 16,
            color: '#fff',
            textAlign: 'center',
            fontSize: collapsed ? 12 : 16,
            fontWeight: 'bold',
          }}
        >
          {collapsed ? 'BDC' : '不动产管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            后台设置
          </Title>
          <Dropdown menu={{ items: userMenuItems }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.realName || user?.username}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px', background: '#fff', padding: 24 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
