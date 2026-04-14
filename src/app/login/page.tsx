'use client'

import { useState } from 'react'
import { Form, Input, Button, Card, message, Typography, Divider } from 'antd'
import { UserOutlined, LockOutlined, HomeOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'

const { Title, Text } = Typography

interface LoginFields {
  username: string
  password: string
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const onFinish = async (values: LoginFields) => {
    setLoading(true)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      })

      const data = await response.json()

      if (!response.ok) {
        message.error(data.error || '登录失败')
        return
      }

      if (data.requiresTwoFactor) {
        message.info('需要双因素认证')
        // TODO: 跳转到双因素认证页面
        return
      }

      // 存储令牌并更新 Zustand store
      setAuth(data.data.token, data.data.user)

      message.success('登录成功')
      router.push('/')
    } catch (error) {
      message.error('登录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      {/* 顶部装饰条 */}
      <div style={styles.topBar} />

      <div style={styles.loginWrapper}>
        {/* 左侧品牌区域 */}
        <div style={styles.brandSection}>
          <div style={styles.logoContainer}>
            <HomeOutlined style={styles.logoIcon} />
          </div>
          <Title level={2} style={styles.brandTitle}>
            不动产证书管理系统
          </Title>
          <Text style={styles.brandSubtitle}>宅基地信息综合管理平台</Text>
          <Divider style={{ borderColor: 'rgba(255,255,255,0.3)', margin: '24px 0' }} />
          <div style={styles.brandDescription}>
            <p>统一、规范、高效的</p>
            <p>宅基地确权登记与信息管理平台</p>
          </div>
        </div>

        {/* 右侧登录表单 */}
        <div style={styles.formSection}>
          <Card style={styles.loginCard} bordered={false}>
            <div style={styles.formHeader}>
              <Title level={3} style={{ margin: 0, color: '#1f1f1f' }}>
                用户登录
              </Title>
              <Text type="secondary">请使用分配的账号密码登录系统</Text>
            </div>

            <Form
              name="login"
              onFinish={onFinish}
              autoComplete="off"
              size="large"
              layout="vertical"
            >
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, max: 20, message: '用户名长度需在 3-20 个字符之间' },
                ]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: '#d9d9d9' }} />}
                  placeholder="请输入用户名"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少 6 位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#d9d9d9' }} />}
                  placeholder="请输入密码"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  style={styles.loginButton}
                  size="large"
                >
                  登 录
                </Button>
              </Form.Item>
            </Form>

            <div style={styles.footer}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                默认账号：admin / admin123
              </Text>
            </div>
          </Card>
        </div>
      </div>

      {/* 页脚 */}
      <div style={styles.pageFooter}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          © 2024 不动产证书管理系统 版权所有
        </Text>
      </div>
    </div>
  )
}

// 政企风格样式
const styles: Record<string, React.CSSProperties> = {
  // 容器
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(135deg, #0d3b6e 0%, #1a5f8f 50%, #2d8ab8 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  // 顶部装饰条（中国红）
  topBar: {
    height: 6,
    background: 'linear-gradient(90deg, #de2910 0%, #ffde00 50%, #de2910 100%)',
    width: '100%',
  },
  // 登录主体区域
  loginWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '60px',
  },
  // 品牌区域（左侧）
  brandSection: {
    flex: 1,
    maxWidth: 400,
    textAlign: 'center',
    color: '#fff',
    padding: '40px 20px',
  },
  // Logo 容器
  logoContainer: {
    width: 100,
    height: 100,
    margin: '0 auto 24px',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    border: '2px solid rgba(255,255,255,0.3)',
  },
  // Logo 图标
  logoIcon: {
    fontSize: 56,
    color: '#ffde00',
  },
  // 品牌标题
  brandTitle: {
    color: '#fff',
    marginBottom: 12,
    fontWeight: 600,
    letterSpacing: '2px',
  },
  // 品牌副标题
  brandSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    letterSpacing: '4px',
  },
  // 品牌描述
  brandDescription: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 2,
    marginTop: 16,
  },
  // 表单区域（右侧）
  formSection: {
    flex: 1,
    maxWidth: 440,
  },
  // 登录卡片
  loginCard: {
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    padding: 24,
  },
  // 表单头部
  formHeader: {
    marginBottom: 32,
    textAlign: 'center',
  },
  // 输入框
  input: {
    height: 44,
    borderRadius: 8,
    fontSize: 15,
  },
  // 登录按钮
  loginButton: {
    height: 48,
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: '4px',
    background: 'linear-gradient(135deg, #1a5f8f 0%, #2d8ab8 100%)',
    borderRadius: 8,
    marginTop: 8,
  },
  // 卡片页脚
  footer: {
    textAlign: 'center',
    paddingTop: 16,
    borderTop: '1px solid #f0f0f0',
  },
  // 页面页脚
  pageFooter: {
    textAlign: 'center',
    padding: '20px',
    background: 'rgba(0,0,0,0.15)',
  },
}
