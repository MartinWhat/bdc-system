'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Descriptions, Button, Steps, Card, Spin, message, Typography, Space } from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

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

interface ProcessNode {
  id: string
  nodeType: string
  nodeName: string
  operatorName?: string
  description?: string
  createdAt: string
}

interface ProcessData {
  objectionId: string
  objectionStatus: string
  workflow: {
    id: string
    name: string
    currentStepOrder: number
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
  processNodes: ProcessNode[]
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

const OBJECTION_TYPE_MAP: Record<string, { text: string; color: string }> = {
  NAME_ERROR: { text: '姓名错误', color: 'orange' },
  ID_CARD_ERROR: { text: '身份证错误', color: 'red' },
  AREA_ERROR: { text: '面积错误', color: 'blue' },
  OTHER: { text: '其他', color: 'default' },
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待处理', color: 'orange' },
  PROCESSING: { text: '处理中', color: 'blue' },
  RESOLVED: { text: '已解决', color: 'green' },
  REJECTED: { text: '已驳回', color: 'red' },
}

const STEP_STATUS_MAP: Record<string, 'wait' | 'process' | 'finish' | 'error'> = {
  PENDING: 'wait',
  APPROVED: 'finish',
  REJECTED: 'error',
}

export default function ObjectionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [processData, setProcessData] = useState<ProcessData | null>(null)

  const loadProcess = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/objection/${params.id}/process`)
      if (res.ok) {
        const data = await res.json()
        setProcessData(data.data)
      } else {
        message.error('加载异议详情失败')
      }
    } catch (error) {
      console.error('Load process error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (params.id) {
      loadProcess()
    }
  }, [params.id])

  const handleProcess = () => {
    router.push(`/objection/${params.id}/process`)
  }

  if (loading) {
    return (
      <PageContainer title="异议详情">
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    )
  }

  if (!processData) {
    return (
      <PageContainer title="异议详情">
        <Card>
          <Text type="secondary">未找到异议记录</Text>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="异议详情"
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          返回
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Card title="异议信息">
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="异议ID">{processData.objectionId}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {STATUS_MAP[processData.objectionStatus]?.text || processData.objectionStatus}
            </Descriptions.Item>
            {processData.workflow && (
              <>
                <Descriptions.Item label="当前流程">{processData.workflow.name}</Descriptions.Item>
                <Descriptions.Item label="当前步骤">
                  第 {processData.workflow.currentStepOrder} 步
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </Card>

        <Card title="关联领证记录">
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="证书编号">
              {processData.receiveRecord?.bdc?.certNo}
            </Descriptions.Item>
            <Descriptions.Item label="领证人">
              {processData.receiveRecord?.bdc?.ownerName}
            </Descriptions.Item>
            <Descriptions.Item label="所属镇村" span={2}>
              {processData.receiveRecord?.bdc?.village?.town?.name}/
              {processData.receiveRecord?.bdc?.village?.name}
            </Descriptions.Item>
            <Descriptions.Item label="领证状态">
              {processData.receiveRecord?.status}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 操作历史 */}
        <Card title="操作历史">
          {processData.processNodes && processData.processNodes.length > 0 ? (
            <Steps
              direction="vertical"
              size="small"
              items={processData.processNodes.map((node) => ({
                title: node.nodeName,
                description: (
                  <span>
                    {node.description}
                    {node.operatorName && ` - ${node.operatorName}`}
                    <br />
                    {dayjs(node.createdAt).format('YYYY-MM-DD HH:mm')}
                  </span>
                ),
                status:
                  node.nodeType === 'RESOLVE' || node.nodeType === 'COMPLETE'
                    ? 'finish'
                    : node.nodeType === 'OBJECTION' || node.nodeType === 'CANCEL'
                      ? 'error'
                      : 'wait',
                icon:
                  node.nodeType === 'RESOLVE' || node.nodeType === 'COMPLETE' ? (
                    <CheckCircleOutlined />
                  ) : node.nodeType === 'OBJECTION' || node.nodeType === 'CANCEL' ? (
                    <CloseCircleOutlined />
                  ) : undefined,
              }))}
            />
          ) : (
            <Text type="secondary">暂无操作记录</Text>
          )}
        </Card>

        <Card title="处理进度">
          <Steps
            direction="vertical"
            size="small"
            current={processData.tasks.length}
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
          {processData.currentTask &&
            processData.objectionStatus !== 'RESOLVED' &&
            processData.objectionStatus !== 'REJECTED' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleProcess}>
                  处理异议
                </Button>
              </div>
            )}
        </Card>
      </Space>
    </PageContainer>
  )
}
