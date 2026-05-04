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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'
import { useThemeStore } from '@/lib/store/theme'
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
  const { user, setAuth, clearAuth } = useAuthStore()
  const { isDark } = useThemeStore()
  const { token } = theme.useToken()

  // 通过 API 加载用户信息（从 httpOnly JWT cookie 获取）
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const response = await authFetch('/api/auth/me', {
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/login')
            return
          }
          clearAuth()
          router.push('/login')
          return
        }

        const data = await response.json()
        const userData = data.data

        if (!userData) {
          clearAuth()
          router.push('/login')
          return
        }

        // 设置用户信息到 store（来自服务端验证的数据）
        setAuth(userData)

        // 检查上次登录时间
        const lastLoginAt = userData.lastLoginAt
        if (lastLoginAt) {
          const now = Date.now()
          const oneDayMs = 24 * 60 * 60 * 1000 // 24 小时
          const lastLoginTime = new Date(lastLoginAt).getTime()

          // 如果超过 24 小时未登录，静默跳转登录页
          if (now - lastLoginTime > oneDayMs) {
            clearAuth()
            router.push('/login')
            return
          }
        }
      } catch (error) {
        console.error('Failed to fetch /api/auth/me:', error)
        clearAuth()
        router.push('/login')
        return
      }
    }

    loadUserInfo()
  }, [router, setAuth, clearAuth])

  // 启动主动刷新定时器
  useEffect(() => {
    if (!user) return

    import('@/lib/token-expiry').then(
      ({ startTokenExpiryTimer, initTokenExpirySync, initActivityTracker }) => {
        startTokenExpiryTimer()
        const cleanupSync = initTokenExpirySync()
        const cleanupActivity = initActivityTracker()
        return () => {
          cleanupSync()
          cleanupActivity()
        }
      },
    )
  }, [user])

  const handleLogout = async () => {
    try {
      await authFetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
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
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        width={200}
        style={{
          background: isDark ? token.colorBgContainer : '#fff',
          borderRight: isDark ? `1px solid ${token.colorBorderSecondary}` : 'none',
        }}
        trigger={null}
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
            background: 'transparent',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 18, cursor: 'pointer', color: token.colorText }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
              不动产证书管理系统
            </Title>
          </div>
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
