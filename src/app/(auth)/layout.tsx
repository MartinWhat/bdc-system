'use client'

import { useState, useEffect, useCallback } from 'react'
import { Layout, Menu, Typography, Avatar, Dropdown, Modal, theme } from 'antd'
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
  BellOutlined,
  ContactsOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'
import { useThemeStore } from '@/lib/store/theme'
import { getUserInfoFromClient } from '@/lib/auth/cookies'
import { onAuthExpiry } from '@/lib/auth-event'
import { authFetch } from '@/lib/api-fetch'
import { hasMenuPermission } from '@/config/menu-permissions'
import ThemeToggle from '@/components/theme-toggle'
import FloatingButtons from '@/components/FloatingButtons'

const { Sider, Content, Header } = Layout
const { Title } = Typography

// 原始菜单配置（用于权限过滤）
const ALL_MENU_ITEMS: MenuProps['items'] = [
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
    key: '/notifications',
    icon: <BellOutlined />,
    label: '通知公告',
  },
  {
    key: '/contacts',
    icon: <ContactsOutlined />,
    label: '通讯录',
  },
  {
    key: '/profile',
    icon: <UserOutlined />,
    label: '个人信息',
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
        key: '/notifications/manage',
        icon: <BellOutlined />,
        label: '通知管理',
      },
      {
        key: '/logs',
        icon: <HistoryOutlined />,
        label: '操作日志',
      },
    ],
  },
]

/**
 * 根据用户权限过滤菜单项
 */
function filterMenuByPermission(
  items: MenuProps['items'],
  permissions: string[],
): MenuProps['items'] {
  if (!items) return []

  return items.filter((item) => {
    if (!item) return false

    // 处理分组
    if (item.type === 'group' && item.children) {
      const filteredChildren = filterMenuByPermission(item.children, permissions)
      if (filteredChildren && filteredChildren.length > 0) {
        return true
      }
      return false
    }

    const key = item.key as string
    if (key) {
      const hasPermission = hasMenuPermission(key, permissions)
      return hasPermission
    }

    return true
  })
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [reLoginModalVisible, setReLoginModalVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const { user, setAuth, clearAuth } = useAuthStore()
  const { isDark } = useThemeStore()
  const { token } = theme.useToken()

  // 动态更新 Sider Trigger 样式
  useEffect(() => {
    const updateSiderTriggerStyle = () => {
      const trigger = document.querySelector('.ant-layout-sider-trigger') as HTMLElement
      if (trigger) {
        trigger.style.background = isDark ? token.colorBgContainer : '#fff'
        trigger.style.color = token.colorText
        trigger.style.borderTop = isDark ? `1px solid ${token.colorBorderSecondary}` : 'none'
        const icon = trigger.querySelector('.anticon') as HTMLElement
        if (icon) {
          icon.style.color = token.colorText
        }
      }
    }

    // 初始设置
    setTimeout(updateSiderTriggerStyle, 0)

    // 监听 collapsed 变化后更新
    const observer = new MutationObserver(updateSiderTriggerStyle)
    const sider = document.querySelector('.ant-layout-sider')
    if (sider) {
      observer.observe(sider, { attributes: true, attributeFilter: ['class'] })
    }

    return () => observer.disconnect()
  }, [isDark, token])

  // 拦截 fetch 检测 401
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args)

      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : ''
        const isAuthRequest =
          url.includes('/login') || url.includes('/token/refresh') || url.includes('/logout')

        if (!isAuthRequest) {
          clearAuth()
          setReLoginModalVisible(true)
        }
      }

      return response
    }

    const unsubscribe = onAuthExpiry(() => {
      clearAuth()
      setReLoginModalVisible(true)
    })

    return () => {
      window.fetch = originalFetch
      unsubscribe()
    }
  }, [clearAuth])

  // 从 Cookie 加载用户信息（同步）
  useEffect(() => {
    const userInfo = getUserInfoFromClient()
    if (userInfo) {
      setAuth(userInfo as any)
    } else {
      router.push('/login')
    }
    setLoading(false)
  }, [router, setAuth])

  const handleReLoginConfirm = useCallback(() => {
    setReLoginModalVisible(false)
    router.push('/login')
  }, [router])

  // 加载中显示空白页
  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <div>加载中...</div>
      </Layout>
    )
  }

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

  // 计算菜单项
  const menuItems = filterMenuByPermission(ALL_MENU_ITEMS, user?.permissions || [])

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        width={200}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
              不动产证书管理系统
            </Title>
            <ThemeToggle />
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

      <Modal
        title="认证已失效"
        open={reLoginModalVisible}
        onOk={handleReLoginConfirm}
        closable={false}
        mask={{ closable: false }}
        okText="重新登录"
        cancelText="取消"
        cancelButtonProps={{ style: { display: 'none' } }}
        okButtonProps={{ danger: true }}
      >
        <p>您的登录状态已过期，需要重新登录才能继续使用系统。</p>
      </Modal>

      <FloatingButtons />
    </Layout>
  )
}
