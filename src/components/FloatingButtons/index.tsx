'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FloatButton, Tooltip, Modal, Form, Input, message, Button, Space } from 'antd'
import {
  PhoneOutlined,
  MessageOutlined,
  ArrowUpOutlined,
  SettingOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons'
import { authFetch } from '@/lib/api-fetch'

/**
 * 右下角悬浮按钮组
 */
export default function FloatingButtons() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false)
  const [feedbackForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // 监听滚动，显示/隐藏返回顶部按钮
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 返回顶部
  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 跳转到通讯录
  const handleContacts = () => {
    router.push('/contacts')
  }

  // 跳转到设置
  const handleSettings = () => {
    router.push('/users')
  }

  // 打开反馈弹窗
  const handleOpenFeedback = () => {
    setFeedbackModalVisible(true)
  }

  // 提交反馈
  const handleSubmitFeedback = async (values: {
    title: string
    description: string
    contact?: string
  }) => {
    setSubmitting(true)
    try {
      const res = await authFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success('反馈提交成功，感谢您的反馈！')
        setFeedbackModalVisible(false)
        feedbackForm.resetFields()
      } else {
        message.error(data.error || '提交失败')
      }
    } catch (error) {
      console.error('Submit feedback error:', error)
      message.error('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* 悬浮按钮组 */}
      <div
        style={{
          position: 'fixed',
          bottom: 100,
          right: 24,
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {/* 通讯录 */}
        <Tooltip title="通讯录" placement="left">
          <FloatButton
            icon={<PhoneOutlined />}
            type="default"
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.3s',
            }}
            onClick={handleContacts}
          />
        </Tooltip>

        {/* 问题反馈 */}
        <Tooltip title="问题反馈" placement="left">
          <FloatButton
            icon={<MessageOutlined />}
            type="default"
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.3s',
            }}
            onClick={handleOpenFeedback}
          />
        </Tooltip>

        {/* 设置 */}
        <Tooltip title="系统设置" placement="left">
          <FloatButton
            icon={<SettingOutlined />}
            type="default"
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.3s',
            }}
            onClick={handleSettings}
          />
        </Tooltip>

        {/* 返回顶部 */}
        {showBackToTop && (
          <FloatButton
            icon={<ArrowUpOutlined />}
            type="primary"
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.3s',
              animation: 'fadeIn 0.3s ease-in',
            }}
            onClick={handleBackToTop}
          />
        )}
      </div>

      {/* 问题反馈弹窗 */}
      <Modal
        title={
          <span>
            <CustomerServiceOutlined style={{ marginRight: 8 }} />
            问题反馈
          </span>
        }
        open={feedbackModalVisible}
        onCancel={() => setFeedbackModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={feedbackForm}
          layout="vertical"
          onFinish={handleSubmitFeedback}
          autoComplete="off"
        >
          <Form.Item
            name="title"
            label="反馈标题"
            rules={[{ required: true, message: '请输入反馈标题' }]}
          >
            <Input placeholder="请简要描述问题" />
          </Form.Item>

          <Form.Item
            name="description"
            label="问题描述"
            rules={[{ required: true, message: '请输入问题描述' }]}
          >
            <Input.TextArea rows={4} placeholder="请详细描述您遇到的问题或建议" />
          </Form.Item>

          <Form.Item name="contact" label="联系方式（可选）" tooltip="方便我们与您联系反馈处理结果">
            <Input placeholder="手机号或邮箱" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setFeedbackModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                提交
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 动画样式 */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  )
}
