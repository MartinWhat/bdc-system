'use client'

import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  Grid,
  message,
} from 'antd'
import { QRCodeSVG } from '@rc-component/qrcode'
import { authClient } from '@/lib/auth/auth-client'

const { Text } = Typography

type SetupResult = {
  totpURI: string
  backupCodes: string[]
}

function extractTotpSecret(totpURI: string) {
  const queryIndex = totpURI.indexOf('?')
  if (queryIndex === -1) {
    return ''
  }

  const params = new URLSearchParams(totpURI.slice(queryIndex + 1))
  return params.get('secret') ?? ''
}

interface TwoFactorSettingsProps {
  enabled: boolean
  onChanged?: () => Promise<void> | void
}

export default function TwoFactorSettings({ enabled, onChanged }: TwoFactorSettingsProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [enableVisible, setEnableVisible] = useState(false)
  const [disableVisible, setDisableVisible] = useState(false)
  const [stage, setStage] = useState<'password' | 'verify'>('password')
  const [setup, setSetup] = useState<SetupResult | null>(null)
  const [enableLoading, setEnableLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [disableLoading, setDisableLoading] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyMode, setVerifyMode] = useState<'totp' | 'backup'>('totp')
  const [trustDevice, setTrustDevice] = useState(false)
  const [enableForm] = Form.useForm()
  const [disableForm] = Form.useForm()
  const totpSecret = setup ? extractTotpSecret(setup.totpURI) : ''

  useEffect(() => {
    if (!enableVisible) {
      return
    }

    setVerifyCode('')
    setVerifyMode('totp')
    setTrustDevice(false)
  }, [enableVisible])

  const closeEnableModal = () => {
    setEnableVisible(false)
    setStage('password')
    setSetup(null)
    setVerifyCode('')
    setVerifyMode('totp')
    setTrustDevice(false)
    enableForm.resetFields()
  }

  const closeDisableModal = () => {
    setDisableVisible(false)
    disableForm.resetFields()
  }

  const openDisableModal = () => {
    disableForm.resetFields()
    setDisableVisible(true)
  }

  const openEnableModal = () => {
    setStage('password')
    setSetup(null)
    setVerifyCode('')
    setVerifyMode('totp')
    setTrustDevice(false)
    enableForm.resetFields()
    setEnableVisible(true)
  }

  const handleEnablePassword = async (values: { password: string }) => {
    setEnableLoading(true)
    try {
      const result = await authClient.twoFactor.enable(
        {
          password: values.password,
          issuer: '不动产登记管理系统',
        },
        {
          credentials: 'include',
        },
      )

      if (result.error) {
        message.error(result.error.message || '启用 2FA 失败')
        return
      }

      setSetup(result.data)
      setStage('verify')
      message.success('已生成 2FA 配置，请完成验证器初始化')
    } catch (error) {
      console.error('Enable two-factor error:', error)
      message.error('启用 2FA 失败，请稍后重试')
    } finally {
      setEnableLoading(false)
    }
  }

  const handleVerifyTwoFactor = async () => {
    const code = verifyCode.trim()
    if (!code) {
      message.error('请输入验证码')
      return
    }

    setVerifyLoading(true)
    try {
      const result =
        verifyMode === 'backup'
          ? await authClient.twoFactor.verifyBackupCode(
              {
                code,
                trustDevice,
              },
              {
                credentials: 'include',
              },
            )
          : await authClient.twoFactor.verifyTotp(
              {
                code,
                trustDevice,
              },
              {
                credentials: 'include',
              },
            )

      if (result.error) {
        message.error(result.error.message || '验证失败')
        return
      }

      message.success('2FA 已开启')
      closeEnableModal()
      await onChanged?.()
    } catch (error) {
      console.error('Verify two-factor error:', error)
      message.error('二次验证失败，请稍后重试')
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleDisableTwoFactor = async (values: { password: string }) => {
    setDisableLoading(true)
    try {
      const result = await authClient.twoFactor.disable(
        {
          password: values.password,
        },
        {
          credentials: 'include',
        },
      )

      if (result.error) {
        message.error(result.error.message || '关闭 2FA 失败')
        return
      }

      message.success('2FA 已关闭')
      closeDisableModal()
      await onChanged?.()
    } catch (error) {
      console.error('Disable two-factor error:', error)
      message.error('关闭 2FA 失败，请稍后重试')
    } finally {
      setDisableLoading(false)
    }
  }

  return (
    <>
      <Card title="双因素认证" size={isMobile ? 'small' : undefined}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={enabled ? 'success' : 'warning'}
            showIcon
            message={enabled ? '当前已开启 2FA' : '当前未开启 2FA'}
            description={
              enabled
                ? '登录时除了密码，还需要完成验证码器或备份码验证。'
                : '启用后，登录时需要额外完成验证码器或备份码验证。'
            }
          />

          <Space wrap>
            {!enabled ? (
              <Button type="primary" onClick={openEnableModal}>
                启用 2FA
              </Button>
            ) : (
              <Button danger onClick={openDisableModal}>
                关闭 2FA
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      <Modal
        title="启用双因素认证"
        open={enableVisible}
        onCancel={closeEnableModal}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 720}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        {stage === 'password' ? (
          <Form form={enableForm} layout="vertical" onFinish={handleEnablePassword}>
            <Alert
              type="info"
              showIcon
              message="请先验证当前密码"
              description="系统会生成一个 TOTP 扫码地址和 10 组备份码。"
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="password"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
            </Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeEnableModal}>取消</Button>
              <Button type="primary" htmlType="submit" loading={enableLoading}>
                生成 2FA 配置
              </Button>
            </Space>
          </Form>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="success"
              showIcon
              message="请扫描二维码并完成验证"
              description="用验证码器扫描二维码后，输入当前 6 位验证码完成开启。"
            />

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    background: 'rgba(0, 0, 0, 0.03)',
                    display: 'inline-flex',
                  }}
                >
                  <QRCodeSVG value={setup?.totpURI || ''} size={192} />
                </div>
              </div>

              <div>
                <Text strong>手动输入密钥</Text>
                <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                  如果设备无法扫码，可复制下面的密钥，在验证码器里选择手动添加。
                </Text>
                <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                  <Input value={totpSecret} readOnly />
                  <Button
                    onClick={async () => {
                      if (!totpSecret) {
                        message.error('密钥不可用')
                        return
                      }

                      try {
                        await navigator.clipboard.writeText(totpSecret)
                        message.success('密钥已复制')
                      } catch (error) {
                        console.error('Copy TOTP secret error:', error)
                        message.error('复制失败，请手动复制')
                      }
                    }}
                  >
                    复制密钥
                  </Button>
                </Space.Compact>
              </div>

              <div>
                <Text strong>备份码</Text>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {setup?.backupCodes.map((code) => (
                    <Text key={code} code copyable style={{ margin: 0 }}>
                      {code}
                    </Text>
                  ))}
                </div>
              </div>

              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Text type="secondary">请选择验证方式并输入当前验证码。</Text>
                <Space wrap>
                  <Button
                    type={verifyMode === 'totp' ? 'primary' : 'default'}
                    onClick={() => setVerifyMode('totp')}
                  >
                    验证器码
                  </Button>
                  <Button
                    type={verifyMode === 'backup' ? 'primary' : 'default'}
                    onClick={() => setVerifyMode('backup')}
                  >
                    备份码
                  </Button>
                </Space>
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder={verifyMode === 'backup' ? '请输入备份码' : '请输入 6 位验证码'}
                  autoComplete="one-time-code"
                />
                <Checkbox checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)}>
                  信任此设备，减少后续验证
                </Checkbox>
              </Space>
            </Space>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button
                onClick={() => {
                  setStage('password')
                  setSetup(null)
                  setVerifyCode('')
                  setTrustDevice(false)
                }}
              >
                返回上一步
              </Button>
              <Space>
                <Button onClick={closeEnableModal}>取消</Button>
                <Button type="primary" loading={verifyLoading} onClick={handleVerifyTwoFactor}>
                  验证并开启
                </Button>
              </Space>
            </Space>
          </Space>
        )}
      </Modal>

      <Modal
        title="关闭双因素认证"
        open={disableVisible}
        onCancel={closeDisableModal}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Form form={disableForm} layout="vertical" onFinish={handleDisableTwoFactor}>
          <Alert
            type="warning"
            showIcon
            message="关闭后登录仅需密码"
            description="如果确认关闭，请输入当前密码完成操作。"
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            name="password"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
          </Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDisableModal}>取消</Button>
            <Button danger type="primary" htmlType="submit" loading={disableLoading}>
              关闭 2FA
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  )
}
