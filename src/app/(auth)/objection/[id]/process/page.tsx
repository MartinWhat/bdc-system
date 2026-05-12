'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Card,
  Descriptions,
  Steps,
  Button,
  Form,
  Input,
  message,
  Spin,
  Typography,
  Alert,
  Space,
  Tag,
  Grid,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'
import ApproverSelectorModal, { User } from '@/components/ApproverSelectorModal'

const { Text } = Typography
const { TextArea } = Input

interface Task {
  id: string
  stepOrder: number
  stepName: string
  stepType: string
  status: string
  approverName?: string
  approvedAt?: string
  approveRemark?: string
}

interface ProcessData {
  objectionId: string
  objectionStatus: string
  workflow: {
    id: string
    name: string
    currentStepOrder: number
    totalSteps: number
  } | null
  currentTask: {
    id: string
    stepOrder: number
    stepName: string
    stepType: string
    status: string
    approverName?: string
    assignedAt?: string
  } | null
  tasks: Task[]
  receiveRecord: {
    id: string
    status: string
    bdc: {
      id: string
      certNo: string
      ownerName: string
      village?: {
        name: string
        town?: { name: string }
      }
    }
  }
}

const STEP_STATUS_MAP: Record<string, 'wait' | 'process' | 'finish' | 'error'> = {
  PENDING: 'process',
  APPROVED: 'finish',
  REJECTED: 'error',
}

export default function ObjectionProcessPage() {
  const params = useParams()
  const router = useRouter()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [processData, setProcessData] = useState<ProcessData | null>(null)
  const [approverSelectorVisible, setApproverSelectorVisible] = useState(false)
  const [selectedApprover, setSelectedApprover] = useState<User | null>(null)
  const [form] = Form.useForm()

  const loadProcess = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/objection/${params.id}/process`)
      if (res.ok) {
        const data = await res.json()
        setProcessData(data.data)
      } else {
        const error = await res.json()
        message.error(error.error || '加载失败')
      }
    } catch (error) {
      console.error('Load process error:', error)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (params.id) {
      loadProcess()
    }
  }, [params.id, loadProcess])

  const handleSubmit = async (action: 'approve' | 'reject') => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const body: Record<string, unknown> = {
        action,
        remark: values.remark,
      }
      if (selectedApprover) {
        body.nextApproverId = selectedApprover.id
        body.nextApproverName = selectedApprover.realName
      }

      const res = await authFetch(`/api/objection/${params.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        message.success(action === 'approve' ? '已通过' : '已驳回')
        form.resetFields()
        loadProcess()

        if (data.data.objectionStatus === 'RESOLVED' || data.data.objectionStatus === 'REJECTED') {
          setTimeout(() => {
            router.push(`/objection/${params.id}`)
          }, 1500)
        }
      } else {
        const error = await res.json()
        message.error(error.error || '操作失败')
      }
    } catch (error) {
      console.error('Submit error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const pageExtra = (
    <Space
      direction={isMobile ? 'vertical' : 'horizontal'}
      style={{ width: isMobile ? '100%' : undefined }}
    >
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} block={isMobile}>
        返回
      </Button>
    </Space>
  )

  if (loading) {
    return (
      <PageContainer title="异议处理">
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    )
  }

  if (!processData) {
    return (
      <PageContainer title="异议处理">
        <Card size={isMobile ? 'small' : undefined}>
          <Text type="secondary">未找到异议记录</Text>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={`异议处理 - ${processData.currentTask?.stepName || '未知步骤'}`}
      extra={pageExtra}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Card title="当前任务" size={isMobile ? 'small' : undefined}>
          {processData.currentTask ? (
            <Descriptions column={isMobile ? 1 : 2} bordered size="small">
              <Descriptions.Item label="步骤名称">
                {processData.currentTask.stepName}
              </Descriptions.Item>
              <Descriptions.Item label="步骤类型">
                {processData.currentTask.stepType}
              </Descriptions.Item>
              <Descriptions.Item label="分配时间">
                {processData.currentTask.assignedAt
                  ? dayjs(processData.currentTask.assignedAt).format('YYYY-MM-DD HH:mm')
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Alert
              type="info"
              message={
                processData.objectionStatus === 'RESOLVED'
                  ? '异议已解决'
                  : processData.objectionStatus === 'REJECTED'
                    ? '异议已驳回'
                    : '没有待处理的任务'
              }
            />
          )}
        </Card>

        <Card title="关联领证记录" size={isMobile ? 'small' : undefined}>
          <Descriptions column={isMobile ? 1 : 2} bordered size="small">
            <Descriptions.Item label="证书编号">
              {processData.receiveRecord?.bdc?.certNo}
            </Descriptions.Item>
            <Descriptions.Item label="领证人">
              {processData.receiveRecord?.bdc?.ownerName}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="处理进度" size={isMobile ? 'small' : undefined}>
          <Steps
            direction="vertical"
            size="small"
            current={processData.tasks.findIndex((t) => t.status === 'PENDING')}
            items={processData.tasks.map((task) => ({
              title: task.stepName,
              description:
                task.status === 'APPROVED'
                  ? `${task.approverName} - ${dayjs(task.approvedAt).format('YYYY-MM-DD HH:mm')}`
                  : task.status === 'PENDING'
                    ? '待处理'
                    : task.approveRemark || task.status,
              status: STEP_STATUS_MAP[task.status] || 'wait',
            }))}
          />
        </Card>

        {processData.currentTask &&
          processData.objectionStatus !== 'RESOLVED' &&
          processData.objectionStatus !== 'REJECTED' && (
            <Card title="审批操作" size={isMobile ? 'small' : undefined}>
              <Form form={form} layout="vertical">
                <Form.Item name="remark" label="处理备注">
                  <TextArea
                    rows={4}
                    placeholder="请输入处理备注（可选）"
                    maxLength={500}
                    showCount
                  />
                </Form.Item>
                {processData.workflow &&
                  processData.currentTask.stepOrder < processData.workflow.totalSteps && (
                    <Form.Item label="下一步处理人" required>
                      <Space
                        direction={isMobile ? 'vertical' : 'horizontal'}
                        style={{ width: '100%' }}
                      >
                        <Button
                          icon={<UserOutlined />}
                          onClick={() => setApproverSelectorVisible(true)}
                          block={isMobile}
                        >
                          {selectedApprover ? '更换处理人' : '选择处理人'}
                        </Button>
                        {selectedApprover && (
                          <Tag color="blue">
                            {selectedApprover.realName} ({selectedApprover.username})
                          </Tag>
                        )}
                      </Space>
                    </Form.Item>
                  )}
                <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleSubmit('approve')}
                    loading={submitting}
                    block={isMobile}
                  >
                    通过
                  </Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => handleSubmit('reject')}
                    loading={submitting}
                    block={isMobile}
                  >
                    驳回
                  </Button>
                </Space>
              </Form>
            </Card>
          )}

        <ApproverSelectorModal
          visible={approverSelectorVisible}
          onCancel={() => setApproverSelectorVisible(false)}
          onConfirm={(user) => {
            setSelectedApprover(user)
            setApproverSelectorVisible(false)
          }}
          initialValue={selectedApprover}
        />
      </Space>
    </PageContainer>
  )
}
