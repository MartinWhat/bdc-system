'use client'

import { useState } from 'react'
import { Form, Input, Button, message, Typography, theme } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  HomeOutlined,
  CheckCircleFilled,
  SecurityScanFilled,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'
import { useThemeStore } from '@/lib/store/theme'

const { Title, Text } = Typography

interface LoginFields {
  username: string
  password: string
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const { isDark } = useThemeStore()
  const { token } = theme.useToken()

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
        return
      }

      setAuth(data.data.accessToken, data.data.refreshToken, data.data.user)
      message.success('登录成功')
      router.push('/')
    } catch (error) {
      message.error('登录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`login-container ${isDark ? 'dark-mode' : ''}`}>
      {/* 左侧品牌区 */}
      <div className={`login-brand ${isDark ? 'dark-mode' : ''}`}>
        <div className="brand-bg-decoration"></div>
        <div className="brand-content">
          {/* 系统标题 */}
          <div className="logo-section">
            <Title level={1} className="system-title">
              不动产登记管理系统
            </Title>
            <div className="gold-line"></div>
            <Text className="system-subtitle">宅基地信息综合管理平台</Text>
          </div>

          {/* 宣传语 */}
          <div className="slogan-section">
            <div className="slogan-item">
              <CheckCircleFilled className="slogan-icon" />
              <span>依法登记 规范高效</span>
            </div>
            <div className="slogan-item">
              <SecurityScanFilled className="slogan-icon" />
              <span>权责清晰 管理规范</span>
            </div>
            <div className="slogan-item">
              <HomeOutlined className="slogan-icon" />
              <span>宅基地信息 一目了然</span>
            </div>
          </div>

          {/* 底部装饰 */}
          <div className="brand-footer">
            <div className="footer-decoration"></div>
            <Text className="footer-text">专业 · 高效 · 便捷 · 安全</Text>
          </div>
        </div>
      </div>

      {/* 右侧登录表单区 */}
      <div className="login-form-wrapper" style={isDark ? { background: 'transparent' } : {}}>
        <div
          className="form-container"
          style={
            isDark
              ? { background: token.colorBgContainer, boxShadow: `0 8px 40px rgba(0, 0, 0, 0.3)` }
              : {}
          }
        >
          {/* 顶部欢迎语 */}
          <div className="form-header">
            <div className="welcome-badge">欢迎登录</div>
            <Title level={2} className="form-title">
              用户登录
            </Title>
            <Text className="form-subtitle">请输入您的账号信息进行登录</Text>
          </div>

          {/* 登录表单 */}
          <Form
            name="login"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
            layout="vertical"
            className="login-form"
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
                prefix={<UserOutlined />}
                placeholder="请输入用户名"
                className="custom-input"
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
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                className="custom-input"
              />
            </Form.Item>

            <Form.Item className="form-action">
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="login-btn"
                block
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          {/* 底部提示 */}
          <div className="form-footer">
            <Text className="default-account">默认账号：admin / admin123</Text>
          </div>
        </div>

        {/* 页脚版权 */}
        <div className="page-footer">
          <Text className="copyright-text">
            © 2024 不动产登记管理系统 版权所有 | 技术支持：XX 市信息中心
          </Text>
        </div>
      </div>

      {/* 全局样式 */}
      <style jsx global>{`
        /* 容器 - 全屏布局 */
        .login-container {
          min-height: 100vh;
          display: flex;
          background: linear-gradient(135deg, #e8f4f8 0%, #f5f7fa 50%, #fef9f3 100%);
          position: relative;
          overflow: hidden;
        }

        /* 暗黑模式背景 */
        .login-container.dark-mode {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        }

        /* 左侧品牌区 */
        .login-brand {
          flex: 1;
          max-width: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 60px;
        }

        /* 暗黑模式品牌区 */
        .login-brand.dark-mode {
          background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
        }

        /* 背景装饰 */
        .brand-bg-decoration {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background:
            radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 50%);
          pointer-events: none;
        }

        .brand-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
        }

        /* Logo 区域 */
        .logo-section {
          text-align: center;
          padding-bottom: 40px;
        }

        .system-title {
          color: #ffffff !important;
          font-size: 36px !important;
          font-weight: 600 !important;
          letter-spacing: 6px !important;
          margin: 0 0 20px 0 !important;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .system-subtitle {
          color: rgba(255, 255, 255, 0.85) !important;
          font-size: 15px !important;
          letter-spacing: 3px !important;
        }

        .gold-line {
          width: 60px;
          height: 2px;
          background: rgba(255, 255, 255, 0.6);
          margin: 20px auto;
          border-radius: 2px;
        }

        /* 宣传语区域 */
        .slogan-section {
          padding: 40px 0;
        }

        .slogan-item {
          display: flex;
          align-items: center;
          gap: 16px;
          color: rgba(255, 255, 255, 0.95);
          font-size: 15px;
          margin-bottom: 16px;
          padding: 14px 20px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .slogan-icon {
          font-size: 18px;
          color: #fff;
          flex-shrink: 0;
        }

        /* 品牌底部 */
        .brand-footer {
          text-align: center;
          padding-top: 40px;
        }

        .footer-decoration {
          width: 40px;
          height: 2px;
          background: rgba(255, 255, 255, 0.4);
          margin: 0 auto 16px;
        }

        .footer-text {
          color: rgba(255, 255, 255, 0.6) !important;
          font-size: 13px !important;
          letter-spacing: 3px !important;
        }

        /* 右侧表单区 */
        .login-form-wrapper {
          flex: 1;
          max-width: 50%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 40px;
          background: transparent;
        }

        .form-container {
          width: 100%;
          max-width: 420px;
          padding: 48px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
        }

        .dark-mode .form-container {
          background: transparent !important;
          box-shadow: none !important;
        }

        /* 表单头部 */
        .form-header {
          margin-bottom: 40px;
          text-align: center;
        }

        .welcome-badge {
          display: inline-block;
          padding: 6px 16px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: #fff;
          border-radius: 20px;
          font-size: 13px;
          letter-spacing: 2px;
          margin-bottom: 20px;
        }

        .form-title {
          color: #333 !important;
          font-size: 28px !important;
          font-weight: 600 !important;
          margin: 16px 0 !important;
        }

        .dark-mode .form-title {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .form-subtitle {
          color: #888 !important;
          font-size: 14px !important;
        }

        .dark-mode .form-subtitle {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        /* 登录表单 */
        .login-form {
          margin-bottom: 24px;
        }

        .login-form .ant-form-item-label > label {
          font-weight: 500;
          color: #333;
          font-size: 14px;
        }

        .dark-mode .login-form .ant-form-item-label > label {
          color: rgba(255, 255, 255, 0.85);
        }

        .custom-input {
          height: 48px !important;
          border-radius: 8px !important;
          border: 1px solid #e8e8e8 !important;
          font-size: 15px !important;
          transition: all 0.3s !important;
          background: #fafafa !important;
        }

        .dark-mode .custom-input {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          color: rgba(255, 255, 255, 0.85) !important;
        }

        .custom-input:hover {
          border-color: #667eea !important;
          background: #fff !important;
        }

        .dark-mode .custom-input:hover {
          border-color: rgba(255, 255, 255, 0.3) !important;
          background: rgba(255, 255, 255, 0.08) !important;
        }

        .custom-input:focus {
          border-color: #667eea !important;
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1) !important;
          background: #fff !important;
        }

        .dark-mode .custom-input:focus {
          border-color: rgba(255, 255, 255, 0.4) !important;
          background: rgba(255, 255, 255, 0.1) !important;
        }

        .custom-input .ant-input-prefix {
          color: #667eea !important;
          margin-right: 12px !important;
        }

        .dark-mode .custom-input .ant-input-prefix {
          color: rgba(255, 255, 255, 0.7) !important;
        }

        .form-action {
          margin-top: 32px;
          margin-bottom: 0 !important;
        }

        .login-btn {
          height: 50px !important;
          font-size: 16px !important;
          font-weight: 500 !important;
          letter-spacing: 4px !important;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
          border: none !important;
          border-radius: 8px !important;
          transition: all 0.3s !important;
        }

        .login-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.35) !important;
        }

        /* 表单底部 */
        .form-footer {
          text-align: center;
          padding-top: 24px;
          border-top: 1px solid #f0f0f0;
        }

        .dark-mode .form-footer {
          border-top-color: rgba(255, 255, 255, 0.15);
        }

        .default-account {
          color: #999 !important;
          font-size: 13px !important;
        }

        .dark-mode .default-account {
          color: rgba(255, 255, 255, 0.4) !important;
        }

        /* 页脚 */
        .page-footer {
          position: absolute;
          bottom: 24px;
          text-align: center;
        }

        .copyright-text {
          color: rgba(0, 0, 0, 0.45) !important;
          font-size: 12px !important;
        }

        .dark-mode .copyright-text {
          color: rgba(255, 255, 255, 0.3) !important;
        }

        /* 响应式设计 */
        @media (max-width: 1024px) {
          .login-brand {
            max-width: 45%;
            padding: 40px;
          }

          .system-title {
            font-size: 28px !important;
          }

          .slogan-item {
            font-size: 14px;
          }
        }

        @media (max-width: 768px) {
          .login-container {
            flex-direction: column;
          }

          .login-brand {
            max-width: 100%;
            min-height: 40vh;
            padding: 30px;
          }

          .brand-content {
            max-width: 100%;
          }

          .system-title {
            font-size: 24px !important;
          }

          .slogan-section {
            display: none;
          }

          .login-form-wrapper {
            max-width: 100%;
            min-height: 60vh;
            padding: 30px 20px;
          }

          .form-container {
            padding: 32px 24px;
          }
        }
      `}</style>
    </div>
  )
}
