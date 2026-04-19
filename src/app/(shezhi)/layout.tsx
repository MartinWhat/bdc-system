'use client'

import { useState, useEffect } from 'react'
import { Layout, Menu, Typography, Avatar, Dropdown, theme } from 'antd'
import type { MenuProps } from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  HomeOutlined,
  BarChartOutlined,
  LogoutOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
  SafetyOutlined,
  HistoryOutlined,
  KeyOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'
import { useThemeStore } from '@/lib/store/theme'
import { initTokenManager, TOKEN_REFRESH_EVENT, extendTokenExpiry } from '@/lib/token-manager'
import { authFetch } from '@/lib/api-fetch'

const { Sider, Content, Header } = Layout
const { Title } = Typography

const menuItems: MenuProps['items'] = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: '工作台',
  },
  {
    key: '/bdc',
    icon: <HomeOutlined />,
    label: '宅基地管理',
  },
  {
    key: '/lingzheng',
    icon: <FileTextOutlined />,
    label: '领证管理',
  },
  {
    key: '/collective',
    icon: <TeamOutlined />,
    label: '村集体所有权',
  },
  {
    key: '/stats',
    icon: <BarChartOutlined />,
    label: '统计报表',
  },
  {
    type: 'divider',
  },
  {
    key: 'settings',
    label: '系统设置',
    type: 'group',
    children: [
      {
        key: '/users',
        icon: <TeamOutlined />,
        label: '用户管理',
      },
      {
        key: '/roles',
        icon: <SafetyOutlined />,
        label: '角色管理',
      },
      {
        key: '/towns',
        icon: <EnvironmentOutlined />,
        label: '镇街管理',
      },
      {
        key: '/villages',
        icon: <EnvironmentOutlined />,
        label: '村居管理',
      },
      {
        key: '/kms',
        icon: <KeyOutlined />,
        label: '密钥管理',
      },
      {
        key: '/logs',
        icon: <HistoryOutlined />,
        label: '操作日志',
      },
    ],
  },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, clearAuth, loadFromStorage } = useAuthStore()
  const { isDark } = useThemeStore()
  const { token } = theme.useToken()

  useEffect(() => {
    // 从 localStorage 加载认证信息
    loadFromStorage()

    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
    }

    // 监听其他标签页的 token 刷新
    const handleTokenRefresh = () => {
      loadFromStorage()
      initTokenManager()
    }

    window.addEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh)

    return () => {
      window.removeEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh)
    }
  }, [router, loadFromStorage])

  // 滑动过期：每次路由变化时重置 token 过期时间
  useEffect(() => {
    extendTokenExpiry()
  }, [pathname])

  const handleLogout = async () => {
    try {
      // 调用登出 API 销毁会话
      const refreshToken = localStorage.getItem('refresh_token')

      await authFetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // 清除本地认证信息
      clearAuth()
      router.push('/login')
    }
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
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme={isDark ? 'dark' : 'light'}
        style={{
          background: isDark ? token.colorBgContainer : '#fff',
          borderRight: isDark ? `1px solid ${token.colorBorderSecondary}` : 'none',
        }}
      >
        <div
          style={{
            height: 32,
            margin: 16,
            color: token.colorText,
            textAlign: 'center',
            fontSize: collapsed ? 12 : 16,
            fontWeight: 'bold',
          }}
        >
          {collapsed ? 'BDC' : '不动产管理系统'}
        </div>
        <Menu
          theme={isDark ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{
            background: isDark ? token.colorBgContainer : undefined,
            borderInlineEnd: 'none',
          }}
        />
      </Sider>
      <Layout style={{ background: token.colorBgLayout }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
            不动产证书管理系统
          </Title>
          <Dropdown menu={{ items: userMenuItems }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span style={{ color: token.colorText }}>{user?.realName || user?.username}</span>
            </div>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            background: token.colorBgContainer,
            padding: 24,
            minHeight: 280,
            borderRadius: token.borderRadiusLG,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
