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
        credentials: 'include', // 包含 Cookie
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

      // Cookie 模式下，Token 已自动存储在 Cookie 中
      // 只需保存用户信息到 Zustand store
      setAuth(data.data.user)
      message.success('登录成功')

      // 等待 Cookie 设置完成再跳转
      setTimeout(() => {
        router.push('/')
      }, 300)
    } catch (error) {
      message.error('登录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`login-container ${isDark ? 'dark-mode' : ''}`}>
      {/* 全屏 SVG 动画背景 */}
      <div className="fullscreen-bg">
        <svg
          className="bg-svg"
          viewBox="0 0 1920 1080"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0052D9" />
              <stop offset="50%" stopColor="#0038A8" />
              <stop offset="100%" stopColor="#002875" />
            </linearGradient>
            <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {/* 主背景 */}
          <rect width="1920" height="1080" fill="url(#bgGrad)" />

          {/* 装饰圆形 - 带动画 */}
          <circle className="float-circle-1" cx="300" cy="300" r="200" fill="url(#circleGrad)" />
          <circle className="float-circle-2" cx="1600" cy="800" r="150" fill="url(#circleGrad)" />
          <circle className="float-circle-3" cx="200" cy="900" r="100" fill="url(#circleGrad)" />
          <circle className="float-circle-4" cx="1700" cy="200" r="80" fill="url(#circleGrad)" />
          <circle className="float-circle-5" cx="960" cy="540" r="300" fill="url(#circleGrad)" />
          <circle className="float-circle-6" cx="1200" cy="400" r="60" fill="url(#circleGrad)" />

          {/* 网格装饰 */}
          <g className="grid-pattern" opacity="0.08">
            {Array.from({ length: 22 }).map((_, i) => (
              <line
                key={`h${i}`}
                x1="0"
                y1={i * 50}
                x2="1920"
                y2={i * 50}
                stroke="#ffffff"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: 39 }).map((_, i) => (
              <line
                key={`v${i}`}
                x1={i * 50}
                y1="0"
                x2={i * 50}
                y2="1080"
                stroke="#ffffff"
                strokeWidth="1"
              />
            ))}
          </g>
        </svg>
      </div>

      {/* 主内容区 */}
      <div className="login-content">
        {/* 左侧品牌区 - 毛玻璃效果 */}
        <div className="brand-panel">
          <div className="brand-content">
            <div className="brand-section">
              <div className="brand-logo">
                <HomeOutlined />
              </div>
              <Title level={1} className="brand-title">
                不动产登记管理系统
              </Title>
              <Text className="brand-subtitle">宅基地信息综合管理平台</Text>
            </div>

            <div className="slogan-section">
              <div className="slogan-card">
                <CheckCircleFilled className="slogan-icon" />
                <div className="slogan-text">依法登记 规范高效</div>
              </div>
              <div className="slogan-card">
                <SecurityScanFilled className="slogan-icon" />
                <div className="slogan-text">权责清晰 管理规范</div>
              </div>
              <div className="slogan-card">
                <HomeOutlined className="slogan-icon" />
                <div className="slogan-text">宅基地信息 一目了然</div>
              </div>
            </div>

            <div className="brand-footer">
              <div className="footer-line"></div>
              <Text className="footer-text">专业 · 高效 · 便捷 · 安全</Text>
            </div>
          </div>
        </div>

        {/* 右侧登录表单区 */}
        <div className="form-panel">
          <div
            className="login-form-card"
            style={
              isDark
                ? { background: token.colorBgContainer, boxShadow: `0 2px 16px rgba(0, 0, 0, 0.4)` }
                : {}
            }
          >
            <div className="form-header">
              <Title level={3} className="welcome-title">
                欢迎登录
              </Title>
              <Text className="welcome-subtitle">请输入您的账号信息进行登录</Text>
            </div>

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

            <div className="features-section">
              <div className="feature-item">
                <CheckCircleFilled className="feature-icon" />
                <Text className="feature-text">依法登记 规范高效</Text>
              </div>
              <div className="feature-item">
                <SecurityScanFilled className="feature-icon" />
                <Text className="feature-text">权责清晰 管理规范</Text>
              </div>
            </div>

            <div className="form-footer">
              <Text className="default-account">默认账号：admin / admin123</Text>
            </div>
          </div>

          <div className="page-footer">
            <Text className="copyright-text">
              © 2024 不动产登记管理系统 版权所有 | 技术支持：XX 市信息中心
            </Text>
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* 容器 */
        .login-container {
          min-height: 100vh;
          width: 100vw;
          position: relative;
          overflow: hidden;
        }

        /* ========== 全屏背景 ========== */
        .fullscreen-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          background: linear-gradient(135deg, #0052d9 0%, #0038a8 50%, #002875 100%);
        }

        .bg-svg {
          width: 100%;
          height: 100%;
        }

        /* 浮动圆形动画 */
        .float-circle-1 {
          animation: float1 15s ease-in-out infinite;
        }

        .float-circle-2 {
          animation: float2 18s ease-in-out infinite reverse;
        }

        .float-circle-3 {
          animation: float1 20s ease-in-out infinite;
          animation-delay: 3s;
        }

        .float-circle-4 {
          animation: float2 12s ease-in-out infinite;
          animation-delay: 1s;
        }

        .float-circle-5 {
          animation: float1 25s ease-in-out infinite;
          animation-delay: 2s;
        }

        .float-circle-6 {
          animation: float2 14s ease-in-out infinite reverse;
          animation-delay: 4s;
        }

        @keyframes float1 {
          0%,
          100% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.3;
          }
          33% {
            transform: translateY(-40px) translateX(20px) scale(1.08);
            opacity: 0.5;
          }
          66% {
            transform: translateY(20px) translateX(-20px) scale(0.95);
            opacity: 0.4;
          }
        }

        @keyframes float2 {
          0%,
          100% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.3;
          }
          33% {
            transform: translateY(30px) translateX(-30px) scale(1.05);
            opacity: 0.45;
          }
          66% {
            transform: translateY(-20px) translateX(25px) scale(0.98);
            opacity: 0.35;
          }
        }

        /* 网格动画 */
        .grid-pattern {
          animation: grid-move 30s linear infinite;
        }

        @keyframes grid-move {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }

        /* ========== 内容区 ========== */
        .login-content {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          padding: 40px 60px;
          gap: 40px;
        }

        /* ========== 品牌面板 - 毛玻璃 ========== */
        .brand-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .brand-content {
          width: 100%;
          max-width: 520px;
          padding: 48px 40px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 3px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 600px;
        }

        .brand-section {
          text-align: center;
          padding-bottom: 32px;
        }

        .brand-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          color: #ffffff;
          font-size: 40px;
          margin-bottom: 24px;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .brand-title {
          color: #ffffff !important;
          font-size: 32px !important;
          font-weight: 600 !important;
          letter-spacing: 4px !important;
          margin: 0 0 16px 0 !important;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
        }

        .brand-subtitle {
          color: rgba(255, 255, 255, 0.85) !important;
          font-size: 14px !important;
          letter-spacing: 2px !important;
        }

        .slogan-section {
          padding: 32px 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .slogan-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: all 0.3s ease;
        }

        .slogan-card:hover {
          transform: translateX(8px);
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .slogan-icon {
          color: #ffffff;
          font-size: 20px;
          flex-shrink: 0;
        }

        .slogan-text {
          color: #ffffff;
          font-size: 15px;
          font-weight: 500;
        }

        .brand-footer {
          text-align: center;
          padding-top: 32px;
        }

        .footer-line {
          width: 48px;
          height: 2px;
          background: rgba(255, 255, 255, 0.4);
          margin: 0 auto 16px;
        }

        .footer-text {
          color: rgba(255, 255, 255, 0.6) !important;
          font-size: 13px !important;
          letter-spacing: 4px !important;
        }

        /* ========== 表单面板 ========== */
        .form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }

        .login-form-card {
          width: 100%;
          max-width: 420px;
          padding: 40px 36px;
          background: #ffffff;
          border-radius: 3px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
        }

        .form-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .welcome-title {
          color: #000000 !important;
          font-size: 22px !important;
          font-weight: 600 !important;
          margin: 0 0 8px 0 !important;
        }

        .welcome-subtitle {
          color: #878787 !important;
          font-size: 14px !important;
        }

        .login-form {
          margin-bottom: 16px;
        }

        .login-form .ant-form-item-label > label {
          font-weight: 500;
          color: #4c4c4c;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .custom-input {
          height: 40px !important;
          border-radius: 3px !important;
          border: 1px solid #dcdcdc !important;
          font-size: 14px !important;
          transition: all 0.2s !important;
          background: #ffffff !important;
        }

        .custom-input:hover {
          border-color: #0052d9 !important;
          background: #ffffff !important;
        }

        .custom-input:focus {
          border-color: #0052d9 !important;
          box-shadow: 0 0 0 2px rgba(0, 82, 217, 0.1) !important;
          background: #ffffff !important;
        }

        .custom-input .ant-input-prefix {
          color: #878787 !important;
          margin-right: 8px !important;
        }

        .form-action {
          margin-top: 24px;
          margin-bottom: 0 !important;
        }

        .login-btn {
          height: 40px !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          letter-spacing: 2px !important;
          background: #0052d9 !important;
          border: none !important;
          border-radius: 3px !important;
          transition: all 0.2s !important;
        }

        .login-btn:hover {
          background: #0038a8 !important;
          box-shadow: 0 2px 8px rgba(0, 82, 217, 0.3) !important;
        }

        .login-btn:active {
          background: #002875 !important;
        }

        .features-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px 0;
          margin-top: 16px;
          border-top: 1px solid #f0f0f0;
        }

        .feature-item {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .feature-icon {
          color: #0052d9;
          font-size: 16px;
        }

        .feature-text {
          color: #878787 !important;
          font-size: 13px !important;
        }

        .form-footer {
          text-align: center;
          padding-top: 16px;
        }

        .default-account {
          color: #878787 !important;
          font-size: 13px !important;
        }

        .page-footer {
          margin-top: 24px;
          text-align: center;
        }

        .copyright-text {
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 12px !important;
        }

        /* ========== 暗黑模式 ========== */
        .dark-mode .brand-content {
          background: rgba(0, 0, 0, 0.3);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .dark-mode .slogan-card {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .dark-mode .slogan-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .dark-mode .login-form-card {
          background: #1f1f1f !important;
        }

        .dark-mode .welcome-title {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .dark-mode .welcome-subtitle {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        .dark-mode .login-form .ant-form-item-label > label {
          color: rgba(255, 255, 255, 0.85);
        }

        .dark-mode .custom-input {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
          color: rgba(255, 255, 255, 0.85) !important;
        }

        .dark-mode .custom-input:hover {
          border-color: rgba(255, 255, 255, 0.3) !important;
          background: rgba(255, 255, 255, 0.08) !important;
        }

        .dark-mode .custom-input:focus {
          border-color: #0052d9 !important;
          background: rgba(255, 255, 255, 0.1) !important;
        }

        .dark-mode .custom-input .ant-input-prefix {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        .dark-mode .features-section {
          border-top-color: rgba(255, 255, 255, 0.15);
        }

        .dark-mode .feature-text {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        .dark-mode .default-account {
          color: rgba(255, 255, 255, 0.4) !important;
        }

        /* ========== 响应式 ========== */
        @media (max-width: 1200px) {
          .login-content {
            padding: 30px 40px;
            gap: 30px;
          }

          .brand-content {
            min-height: auto;
            padding: 36px 32px;
          }

          .brand-title {
            font-size: 26px !important;
          }

          .brand-logo {
            width: 64px;
            height: 64px;
            font-size: 32px;
          }
        }

        @media (max-width: 992px) {
          .login-content {
            flex-direction: column;
            padding: 24px 20px;
          }

          .brand-panel {
            padding: 20px;
          }

          .brand-content {
            max-width: 100%;
          }

          .form-panel {
            padding: 20px;
          }
        }

        @media (max-width: 576px) {
          .brand-section {
            padding-bottom: 24px;
          }

          .brand-title {
            font-size: 20px !important;
            letter-spacing: 2px !important;
          }

          .brand-logo {
            width: 56px;
            height: 56px;
            font-size: 28px;
            margin-bottom: 16px;
          }

          .slogan-card {
            padding: 12px 14px;
          }

          .slogan-text {
            font-size: 14px;
          }

          .login-form-card {
            padding: 32px 24px;
          }

          .welcome-title {
            font-size: 20px !important;
          }

          .copyright-text {
            color: rgba(255, 255, 255, 0.6) !important;
          }
        }
      `}</style>
    </div>
  )
}
