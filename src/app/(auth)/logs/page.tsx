'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Form,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Card,
  Statistic,
  Row,
  Col,
  message,
  Typography,
} from 'antd'
import { SearchOutlined, ReloadOutlined, BarChartOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'

const { Text } = Typography

const { RangePicker } = DatePicker

interface LogEntry {
  id: string
  action: string
  module: string
  description: string
  status: string
  ipAddress?: string
  createdAt: string
  user: {
    username: string
    realName: string
  }
  bdc?: {
    certNo: string
    ownerName: string
  }
}

interface LogStats {
  totalLogs: number
  successLogs: number
  failedLogs: number
  moduleStats: Array<{
    module: string
    count: number
  }>
}

const ACTION_MAP: Record<string, string> = {
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  LOGIN: '登录',
  LOGOUT: '登出',
  APPROVE: '审核',
  REJECT: '驳回',
  CERTIFY: '发证',
  CANCEL: '注销',
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [form] = Form.useForm()

  const loadLogs = useCallback(
    async (page = 1, size = 20, filters: Record<string, string> = {}) => {
      setLoading(true)
      try {
        const token = localStorage.getItem('access_token')
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(size),
          ...filters,
        })

        const res = await fetch(`/api/logs?${params}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        })
        const data = await res.json()
        if (data.success) {
          setLogs(data.data.list)
          setTotal(data.data.total)
        } else {
          message.error(data.error || '加载失败')
        }
      } catch (error) {
        console.error('Load logs error:', error)
        message.error('加载日志失败')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const loadStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/logs/stats?days=7', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      const data = await res.json()
      if (data.success) {
        setStats(data.data)
      } else {
        message.error(data.error || '加载统计失败')
      }
    } catch (error) {
      console.error('Load stats error:', error)
      message.error('加载统计失败')
    }
  }, [])

  useEffect(() => {
    loadLogs()
    loadStats()
  }, [])

  const handleSearch = (values: {
    userId?: string
    module?: string
    action?: string
    status?: string
    dateRange?: [dayjs.Dayjs, dayjs.Dayjs]
  }) => {
    const filters: Record<string, string> = {}
    if (values.userId) filters.userId = values.userId
    if (values.module) filters.module = values.module
    if (values.action) filters.action = values.action
    if (values.status) filters.status = values.status
    if (values.dateRange) {
      filters.startDate = values.dateRange[0].toISOString()
      filters.endDate = values.dateRange[1].toISOString()
    }

    setCurrentPage(1)
    loadLogs(1, pageSize, filters)
  }

  const handleReset = () => {
    form.resetFields()
    setCurrentPage(1)
    loadLogs(1, pageSize)
  }

  const columns: ColumnsType<LogEntry> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      key: 'user',
      width: 120,
      render: (_, record) => `${record.user.realName} (${record.user.username})`,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => ACTION_MAP[action] || action,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '关联档案',
      key: 'bdc',
      width: 150,
      render: (_, record) => (record.bdc ? `${record.bdc.certNo} - ${record.bdc.ownerName}` : '-'),
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'SUCCESS' ? 'green' : 'red'}>
          {status === 'SUCCESS' ? '成功' : '失败'}
        </Tag>
      ),
    },
  ]

  return (
    <PageContainer
      title="操作日志"
      dataSource={logs}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无操作日志"
    >
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="总操作数" value={stats.totalLogs} prefix={<BarChartOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="成功操作"
                value={stats.successLogs}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="失败操作"
                value={stats.failedLogs}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="统计周期" value="7天" />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选表单 */}
      <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 16 }}>
        <Form.Item name="module" label="模块">
          <Select placeholder="选择模块" style={{ width: 120 }} allowClear>
            <Select.Option value="AUTH">认证</Select.Option>
            <Select.Option value="USER">用户管理</Select.Option>
            <Select.Option value="ROLE">角色管理</Select.Option>
            <Select.Option value="BDC">宅基地管理</Select.Option>
            <Select.Option value="TOWN">镇街管理</Select.Option>
            <Select.Option value="VILLAGE">村居管理</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="action" label="操作">
          <Select placeholder="选择操作" style={{ width: 120 }} allowClear>
            {Object.entries(ACTION_MAP).map(([key, value]) => (
              <Select.Option key={key} value={key}>
                {value}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select placeholder="选择状态" style={{ width: 100 }} allowClear>
            <Select.Option value="SUCCESS">成功</Select.Option>
            <Select.Option value="FAILED">失败</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="dateRange" label="时间范围">
          <RangePicker />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询
            </Button>
            <Button onClick={handleReset} icon={<ReloadOutlined />}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {/* 日志表格 */}
      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, size) => {
            setCurrentPage(page)
            setPageSize(size)
            loadLogs(page, size)
          },
        }}
      />
    </PageContainer>
  )
}
