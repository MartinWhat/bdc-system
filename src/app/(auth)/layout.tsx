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
import {
  refreshAccessToken,
  initTokenManager,
  TOKEN_REFRESH_EVENT,
  extendTokenExpiry,
} from '@/lib/token-manager'
import { triggerAuthExpiry, onAuthExpiry } from '@/lib/auth-event'
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
      // 如果分组内有可见菜单，保留分组
      if (filteredChildren && filteredChildren.length > 0) {
        return true
      }
      return false
    }

    // 检查权限
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
  const pathname = usePathname()
  const router = useRouter()
  const { user, clearAuth, loadFromStorage, refreshToken } = useAuthStore()
  const { isDark } = useThemeStore()
  const { token } = theme.useToken()

  useEffect(() => {
    // 从 localStorage 加载认证信息
    loadFromStorage()

    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
    }
  }, [router, loadFromStorage])

  // 定时检查 token 是否有效
  useEffect(() => {
    const checkTokenValidity = async () => {
      const token = localStorage.getItem('access_token')
      const tokenExpiry = localStorage.getItem('token_expiry')

      // 如果没有 token 或 token 已过期，尝试刷新
      if (!token || (tokenExpiry && Date.now() >= parseInt(tokenExpiry))) {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          // 尝试刷新 token
          const success = await refreshAccessToken()
          if (!success) {
            clearAuth()
            router.push('/login')
          }
        } else {
          clearAuth()
          router.push('/login')
        }
      }
    }

    // 每 30 秒检查一次
    const interval = setInterval(checkTokenValidity, 30000)

    // 监听 storage 事件（其他标签页的登录/登出）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'access_token' && !e.newValue) {
        clearAuth()
        router.push('/login')
      } else if (e.key === 'access_token' && e.newValue) {
        // 其他标签页刷新了 token，同步本地状态
        loadFromStorage()
      }
    }

    // 监听 token 刷新事件（其他标签页刷新 token）
    const handleTokenRefresh = () => {
      loadFromStorage()
      initTokenManager()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(TOKEN_REFRESH_EVENT, handleTokenRefresh)
    }
  }, [router, clearAuth, refreshAccessToken, loadFromStorage])

  // 滑动过期：每次路由变化时重置 token 过期时间
  useEffect(() => {
    extendTokenExpiry()
  }, [pathname])

  // 用户活动时重置 token 过期时间（点击、键盘等）
  // 使用防抖避免频繁调用
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null
    const DEBOUNCE_DELAY = 60000 // 1 分钟内最多延长一次

    const handleUserActivity = () => {
      if (debounceTimer) return

      extendTokenExpiry()

      debounceTimer = setTimeout(() => {
        debounceTimer = null
      }, DEBOUNCE_DELAY)
    }

    // 只监听 click 和 keydown 事件（频率较低）
    window.addEventListener('click', handleUserActivity)
    window.addEventListener('keydown', handleUserActivity)

    return () => {
      window.removeEventListener('click', handleUserActivity)
      window.removeEventListener('keydown', handleUserActivity)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [])

  // 拦截所有 fetch 请求，检测 401 错误
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args)

      // 如果是 401 响应且不是登录/刷新相关的请求
      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : ''
        const isAuthRequest =
          url.includes('/login') || url.includes('/token/refresh') || url.includes('/logout')

        if (!isAuthRequest) {
          console.log('[Layout] 401 detected for:', url, 'Showing login dialog')
          // 清除本地认证信息
          clearAuth()
          // 显示重新登录对话框
          setReLoginModalVisible(true)
        }
      }

      return response
    }

    // 监听认证失效事件（由 authFetch 触发）
    const unsubscribe = onAuthExpiry(() => {
      console.log('[Layout] Auth expiry event received, showing login dialog')
      console.log('[Layout] Current reLoginModalVisible:', reLoginModalVisible)
      // 清除本地认证信息
      clearAuth()
      // 显示重新登录对话框
      setReLoginModalVisible(true)
      console.log('[Layout] Set reLoginModalVisible to true')
    })

    // 组件卸载时恢复原始 fetch 和取消订阅
    return () => {
      window.fetch = originalFetch
      unsubscribe()
    }
  }, [router, clearAuth])

  // 处理重新登录对话框确认
  const handleReLoginConfirm = useCallback(() => {
    setReLoginModalVisible(false)
    router.push('/login')
  }, [router])

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

  // 根据用户权限过滤菜单
  const menuItems = filterMenuByPermission(ALL_MENU_ITEMS, user?.permissions || [])

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

      {/* Token 过期重新登录对话框 */}
      <Modal
        title="认证已失效"
        open={reLoginModalVisible}
        onOk={handleReLoginConfirm}
        closable={false}
        maskClosable={false}
        okText="重新登录"
        cancelText="取消"
        cancelButtonProps={{ style: { display: 'none' } }}
        okButtonProps={{ danger: true }}
      >
        <p>您的登录状态已过期，需要重新登录才能继续使用系统。</p>
      </Modal>

      {/* 右下角悬浮按钮组 */}
      <FloatingButtons />
    </Layout>
  )
}
