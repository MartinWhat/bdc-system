'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Select,
  Input,
  message,
  Space,
  Tag,
  Typography,
  Badge,
  Descriptions,
  Card,
  List,
} from 'antd'
import { EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'
import { useRouter } from 'next/navigation'

const { Text } = Typography
const { Search } = Input

interface Objection {
  id: string
  receiveRecordId: string
  objectionType: string
  description: string
  contactName?: string
  contactPhone?: string
  status: string
  resolveRemark?: string
  resolverId?: string
  resolverName?: string
  resolvedAt?: string
  currentWorkflowId?: string
  currentStepOrder?: number
  createdAt: string
  receiveRecord: {
    id: string
    status: string
    bdc: {
      id: string
      certNo: string
      ownerName: string
      village: {
        name: string
        town: { name: string }
      }
    }
  }
}

interface ReceiveRecord {
  id: string
  status: string
  bdc: {
    id: string
    certNo: string
    ownerName: string
    village: {
      name: string
      town: { name: string }
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

const RECEIVE_STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待领证', color: 'orange' },
  ISSUED: { text: '已发放', color: 'blue' },
  COMPLETED: { text: '已完成', color: 'green' },
  OBJECTION: { text: '异议中', color: 'red' },
  CANCELLED: { text: '已取消', color: 'default' },
}

export default function ObjectionPage() {
  const router = useRouter()
  const [objections, setObjections] = useState<Objection[]>([])
  const [loading, setLoading] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [selectedObjection, setSelectedObjection] = useState<Objection | null>(null)
  const [receiveRecords, setReceiveRecords] = useState<ReceiveRecord[]>([])
  const [selectedReceiveRecord, setSelectedReceiveRecord] = useState<ReceiveRecord | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [createForm] = Form.useForm()

  const loadObjections = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/objection')
      if (res.ok) {
        const data = await res.json()
        setObjections(data.data.list || [])
      }
    } catch (error) {
      console.error('Load objections error:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchReceiveRecords = async (keyword: string) => {
    if (!keyword.trim()) {
      setReceiveRecords([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await authFetch(
        `/api/receive?keyword=${encodeURIComponent(keyword)}&status=ISSUED&pageSize=20`,
      )
      if (res.ok) {
        const data = await res.json()
        console.log('Search receive records result:', data.data?.list)
        // 只显示可以创建异议的记录（已发放状态）
        const records = (data.data.list || []).filter((r: ReceiveRecord) => r.status === 'ISSUED')
        setReceiveRecords(records)
      }
    } catch (error) {
      console.error('Search receive records error:', error)
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    loadObjections()
  }, [])

  const handleViewDetail = (record: Objection) => {
    setSelectedObjection(record)
    setDetailVisible(true)
  }

  const handleCreateObjection = () => {
    setSelectedReceiveRecord(null)
    setReceiveRecords([])
    setSearchKeyword('')
    createForm.resetFields()
    setCreateModalVisible(true)
  }

  const handleSelectReceiveRecord = (record: ReceiveRecord) => {
    setSelectedReceiveRecord(record)
  }

  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields()
      if (!selectedReceiveRecord) {
        message.error('请选择领证记录')
        return
      }

      console.log('Creating objection with:', {
        receiveRecordId: selectedReceiveRecord.id,
        objectionType: values.objectionType,
        description: values.description,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
      })

      const res = await authFetch('/api/objection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiveRecordId: selectedReceiveRecord.id,
          objectionType: values.objectionType,
          description: values.description,
          contactName: values.contactName,
          contactPhone: values.contactPhone,
        }),
      })

      if (res.ok) {
        const result = await res.json()
        message.success('异议已创建')
        setCreateModalVisible(false)
        loadObjections()
        // 跳转到新创建的异议页面
        if (result.data?.id) {
          router.push(`/objection/${result.data.id}`)
        }
      } else {
        const error = await res.json()
        const errorMsg = error.details || error.error || '创建失败'
        message.error(errorMsg)
        console.error('Create objection error:', error)
      }
    } catch (error) {
      console.error('Create objection error:', error)
    }
  }

  const handleProcess = (record: Objection) => {
    router.push(`/objection/${record.id}/process`)
  }

  const columns: ColumnsType<Objection> = [
    {
      title: '异议类型',
      dataIndex: 'objectionType',
      key: 'objectionType',
      render: (type: string) => {
        const config = OBJECTION_TYPE_MAP[type] || { text: type, color: 'default' }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '关联领证记录',
      dataIndex: ['receiveRecord', 'bdc', 'certNo'],
      key: 'certNo',
      render: (certNo: string, record: Objection) => (
        <Space direction="vertical" size={0}>
          <Text strong>{certNo}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.receiveRecord?.bdc?.ownerName}
          </Text>
        </Space>
      ),
    },
    {
      title: '所属镇村',
      key: 'location',
      render: (_, record) => (
        <Text>
          {record.receiveRecord?.bdc?.village?.town?.name}/
          {record.receiveRecord?.bdc?.village?.name}
        </Text>
      ),
    },
    {
      title: '异议描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 200,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const config = STATUS_MAP[status] || { text: status, color: 'default' }
        return <Badge status={config.color as any} text={config.text} />
      },
    },
    {
      title: '当前步骤',
      key: 'currentStep',
      render: (_, record) => {
        if (!record.currentWorkflowId) return <Text type="secondary">未启动流程</Text>
        return <Text>第 {record.currentStepOrder} 步</Text>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.currentWorkflowId && (
            <Button type="link" size="small" onClick={() => handleProcess(record)}>
              处理
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="异议管理"
      extra={[
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreateObjection}>
          新增异议
        </Button>,
      ]}
    >
      <Table columns={columns} dataSource={objections} rowKey="id" loading={loading} bordered />
      <Modal
        title="异议详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedObjection && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="异议类型">
                {OBJECTION_TYPE_MAP[selectedObjection.objectionType]?.text ||
                  selectedObjection.objectionType}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {STATUS_MAP[selectedObjection.status]?.text || selectedObjection.status}
              </Descriptions.Item>
              <Descriptions.Item label="关联证书">
                {selectedObjection.receiveRecord?.bdc?.certNo}
              </Descriptions.Item>
              <Descriptions.Item label="领证人">
                {selectedObjection.receiveRecord?.bdc?.ownerName}
              </Descriptions.Item>
              <Descriptions.Item label="所属镇村" span={2}>
                {selectedObjection.receiveRecord?.bdc?.village?.town?.name}/
                {selectedObjection.receiveRecord?.bdc?.village?.name}
              </Descriptions.Item>
              <Descriptions.Item label="联系人">
                {selectedObjection.contactName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">
                {selectedObjection.contactPhone || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="异议描述" span={2}>
                {selectedObjection.description}
              </Descriptions.Item>
              {selectedObjection.resolveRemark && (
                <Descriptions.Item label="处理备注" span={2}>
                  {selectedObjection.resolveRemark}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="创建时间">
                {dayjs(selectedObjection.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              {selectedObjection.resolvedAt && (
                <Descriptions.Item label="处理时间">
                  {dayjs(selectedObjection.resolvedAt).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>
      <Modal
        title="新增异议"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={handleCreateSubmit}
        okText="创建"
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Card title="选择领证记录" size="small">
            <Search
              placeholder="搜索证书编号或领证人姓名"
              loading={searchLoading}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onSearch={searchReceiveRecords}
              enterButton={
                <>
                  <SearchOutlined /> 搜索
                </>
              }
            />
            {receiveRecords.length > 0 && (
              <List
                size="small"
                dataSource={receiveRecords}
                style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}
                renderItem={(record) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      background: selectedReceiveRecord?.id === record.id ? '#e6f7ff' : undefined,
                      padding: '8px 12px',
                    }}
                    onClick={() => handleSelectReceiveRecord(record)}
                  >
                    <Space direction="vertical" size={0}>
                      <Text strong>{record.bdc.certNo}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.bdc.ownerName} - {record.bdc.village?.town?.name}/
                        {record.bdc.village?.name}
                      </Text>
                    </Space>
                    <Tag
                      color={RECEIVE_STATUS_MAP[record.status]?.color}
                      style={{ marginLeft: 'auto' }}
                    >
                      {RECEIVE_STATUS_MAP[record.status]?.text}
                    </Tag>
                  </List.Item>
                )}
              />
            )}
            {selectedReceiveRecord && (
              <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                <Text type="secondary">已选择：</Text>
                <Text strong style={{ marginLeft: 8 }}>
                  {selectedReceiveRecord.bdc.certNo} - {selectedReceiveRecord.bdc.ownerName}
                </Text>
              </div>
            )}
          </Card>
          <Card title="异议信息" size="small">
            <Form form={createForm} layout="vertical">
              <Form.Item
                name="objectionType"
                label="异议类型"
                rules={[{ required: true, message: '请选择异议类型' }]}
              >
                <Select placeholder="请选择异议类型">
                  <Select.Option value="NAME_ERROR">姓名错误</Select.Option>
                  <Select.Option value="ID_CARD_ERROR">身份证错误</Select.Option>
                  <Select.Option value="AREA_ERROR">面积错误</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="contactName"
                label="联系人"
                rules={[{ required: true, message: '请输入联系人姓名' }]}
              >
                <Input placeholder="请输入联系人姓名" />
              </Form.Item>
              <Form.Item
                name="contactPhone"
                label="联系电话"
                rules={[
                  { required: true, message: '请输入联系电话' },
                  { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
                ]}
              >
                <Input placeholder="请输入联系电话" maxLength={11} />
              </Form.Item>
              <Form.Item
                name="description"
                label="异议描述"
                rules={[{ required: true, message: '请输入异议描述' }]}
              >
                <Input.TextArea
                  rows={3}
                  placeholder="请详细描述异议内容"
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Form>
          </Card>
        </Space>
      </Modal>
    </PageContainer>
  )
}
