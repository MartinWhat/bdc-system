'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Select,
  Space,
  Typography,
  Spin,
  Table,
  Tag,
  Button,
  message,
  Dropdown,
} from 'antd'
import {
  HomeOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  DownloadOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { Pie, Bar, Line } from '@ant-design/charts'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import TownVillageCascader from '@/components/TownVillageCascader'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

interface StatsData {
  overview: {
    totalBdc: number
    totalCert: number
    thisMonthBdc: number
    thisMonthCert: number
  }
  bdcStatus: Array<{ status: string; statusName: string; count: number }>
  certStatus: Array<{ status: string; statusName: string; count: number }>
  townStats: Array<{ townId: string; townName: string; bdcCount: number; certCount: number }>
  pendingTasks: {
    pendingBdc: number
    pendingCertApprove: number
    pendingReceive: number
    pendingObjection: number
    total: number
  }
  recentActivity: Array<{ action: string; count: number }>
}

interface TrendData {
  type: string
  stats: Array<{
    date?: string
    week?: string
    month?: string
    year?: string
    bdcCount: number
    certCount: number
    logCount: number
  }>
  summary: {
    totalBdc: number
    totalCert: number
    totalLog: number
  }
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [trendData, setTrendData] = useState<TrendData | null>(null)
  const [trendType, setTrendType] = useState<string>('monthly')
  const [filterTownId, setFilterTownId] = useState<string>('')
  const [filterVillageId, setFilterVillageId] = useState<string>('')

  const loadStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterTownId) params.set('townId', filterTownId)

      const res = await authFetch(`/api/stats?${params}`)
      const data = await res.json()
      if (data.success) {
        setStats(data.data)
      } else {
        message.error(data.error || '加载统计数据失败')
      }
    } catch (error) {
      console.error('Load stats error:', error)
      message.error('加载统计数据失败')
    }
  }, [filterTownId])

  const loadTrend = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type: trendType })
      if (filterTownId) params.set('townId', filterTownId)

      const res = await authFetch(`/api/stats/trend?${params}`)
      const data = await res.json()
      if (data.success) {
        setTrendData(data.data)
      } else {
        message.error(data.error || '加载趋势数据失败')
      }
    } catch (error) {
      console.error('Load trend error:', error)
      message.error('加载趋势数据失败')
    }
  }, [trendType, filterTownId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadStats(), loadTrend()]).finally(() => setLoading(false))
  }, [loadStats, loadTrend])

  // 导出报表
  const handleExport = async (type: string, format: string = 'xlsx') => {
    try {
      const params = new URLSearchParams({ type, format })
      if (filterTownId) params.set('townId', filterTownId)

      const res = await authFetch(`/api/stats/export?${params}`)

      if (!res.ok) {
        throw new Error('Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `统计报表_${type}_${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      message.success('导出成功')
    } catch (error) {
      console.error('Export error:', error)
      message.error('导出失败')
    }
  }

  // 饼图配置
  const pieConfig = (data: Array<{ statusName: string; count: number }>, height = 280) => ({
    data,
    angleField: 'count',
    colorField: 'statusName',
    radius: 0.8,
    innerRadius: 0.6,
    label: {
      text: 'count',
      style: { fontWeight: 'bold' },
    },
    legend: {
      position: 'right' as const,
    },
    annotations: [
      {
        type: 'text',
        style: { text: 'text', fontSize: 14, fontWeight: 'bold' },
        content: '总计',
      },
    ],
    height,
  })

  // 柱状图配置
  const barConfig = (
    data: Array<{ townName: string; bdcCount: number; certCount: number }>,
    height = 300,
  ) => ({
    data,
    xField: 'townName',
    yField: 'value',
    seriesField: 'type',
    isGroup: true,
    groupField: 'type',
    label: {
      text: 'value',
      style: { fontSize: 10 },
    },
    legend: {
      position: 'top' as const,
    },
    height,
  })

  // 转换镇街数据为图表格式
  const townChartData = () => {
    if (!stats?.townStats) return []
    const result: Array<{ townName: string; value: number; type: string }> = []
    stats.townStats.forEach((t) => {
      result.push({ townName: t.townName, value: t.bdcCount, type: '宅基地' })
      result.push({ townName: t.townName, value: t.certCount, type: '村集体证书' })
    })
    return result
  }

  // 趋势图配置
  const getTrendConfig = () => {
    if (!trendData) return {}
    const { stats: data, type } = trendData

    let xField = 'month'
    let tickCount = 12

    if (type === 'daily') {
      xField = 'date'
      tickCount = 7
    } else if (type === 'weekly') {
      xField = 'week'
      tickCount = 6
    } else if (type === 'monthly') {
      xField = 'month'
      tickCount = 12
    } else if (type === 'yearly') {
      xField = 'year'
      tickCount = 5
    }

    return {
      data,
      xField,
      yField: 'value',
      seriesField: 'category',
      smooth: true,
      label: {
        text: 'value',
        style: { fontSize: 10, fill: '#aaa' },
      },
      legend: {
        position: 'top' as const,
      },
      lineStyle: {
        lineWidth: 2,
      },
      point: {
        size: 3,
        shape: 'circle',
      },
      tickCount,
      height: 300,
    }
  }

  // 转换趋势数据为多系列格式
  const getTrendChartData = () => {
    if (!trendData) return []
    const { stats: data } = trendData
    const result: Array<{ [key: string]: string | number }> = []

    let xField = 'month'
    if (trendData.type === 'daily') xField = 'date'
    else if (trendData.type === 'weekly') xField = 'week'
    else if (trendData.type === 'yearly') xField = 'year'

    data.forEach((d) => {
      const xValue = d[xField as keyof typeof d] as string
      if (d.bdcCount > 0) {
        result.push({ [xField]: xValue, category: '宅基地', value: d.bdcCount })
      }
      if (d.certCount > 0) {
        result.push({ [xField]: xValue, category: '村集体证书', value: d.certCount })
      }
      if (d.logCount > 0) {
        result.push({ [xField]: xValue, category: '操作日志', value: d.logCount })
      }
    })
    return result
  }

  const trendChartData = getTrendChartData()
  const trendConfig = getTrendConfig()

  // 待处理任务列表
  const pendingTasks = stats?.pendingTasks

  if (loading) {
    return (
      <PageContainer title="统计报表">
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="统计报表"
      extra={
        <Space>
          <TownVillageCascader
            value={
              filterTownId
                ? filterVillageId
                  ? [filterTownId, filterVillageId]
                  : [filterTownId]
                : undefined
            }
            onChange={(value) => {
              setFilterTownId(value[0] || '')
              setFilterVillageId(value[1] || '')
            }}
          />
          <Select
            value={trendType}
            onChange={setTrendType}
            style={{ width: 120 }}
            options={[
              { value: 'daily', label: '按日' },
              { value: 'weekly', label: '按周' },
              { value: 'monthly', label: '按月' },
              { value: 'yearly', label: '按年' },
            ]}
          />
          <ReloadOutlined
            onClick={() => {
              loadStats()
              loadTrend()
            }}
            style={{ fontSize: 16, cursor: 'pointer' }}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'bdc-xlsx',
                  label: '导出宅基地 Excel',
                  onClick: () => handleExport('bdc', 'xlsx'),
                },
                {
                  key: 'bdc-csv',
                  label: '导出宅基地 CSV',
                  onClick: () => handleExport('bdc', 'csv'),
                },
                {
                  key: 'cert-xlsx',
                  label: '导出村集体证书 Excel',
                  onClick: () => handleExport('cert', 'xlsx'),
                },
                {
                  key: 'trend-xlsx',
                  label: '导出趋势分析 Excel',
                  onClick: () => handleExport('trend', 'xlsx'),
                },
                { type: 'divider' },
                {
                  key: 'bdc-pdf',
                  label: '导出宅基地 PDF',
                  onClick: () => handleExport('bdc', 'pdf'),
                },
                {
                  key: 'cert-pdf',
                  label: '导出村集体证书 PDF',
                  onClick: () => handleExport('cert', 'pdf'),
                },
                {
                  key: 'trend-pdf',
                  label: '导出趋势分析 PDF',
                  onClick: () => handleExport('trend', 'pdf'),
                },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />}>
              导出报表 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
    >
      {/* 概览统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="宅基地总数"
              value={stats?.overview.totalBdc || 0}
              prefix={<HomeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="村集体证书总数"
              value={stats?.overview.totalCert || 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增宅基地"
              value={stats?.overview.thisMonthBdc || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理任务"
              value={pendingTasks?.total || 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 待处理任务详情 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title="待处理任务" size="small">
            <Space size="large">
              <Text>
                待审核宅基地：<Tag color="blue">{pendingTasks?.pendingBdc || 0}</Tag>
              </Text>
              <Text>
                待审核证书：<Tag color="purple">{pendingTasks?.pendingCertApprove || 0}</Tag>
              </Text>
              <Text>
                待领证：<Tag color="orange">{pendingTasks?.pendingReceive || 0}</Tag>
              </Text>
              <Text>
                待处理异议：<Tag color="red">{pendingTasks?.pendingObjection || 0}</Tag>
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* 宅基地状态分布 */}
        <Col span={8}>
          <Card title="宅基地状态分布">
            {stats?.bdcStatus && stats.bdcStatus.length > 0 ? (
              <Pie {...pieConfig(stats.bdcStatus)} />
            ) : (
              <div style={{ height: 280, textAlign: 'center', lineHeight: '280px', color: '#999' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>

        {/* 村集体证书状态分布 */}
        <Col span={8}>
          <Card title="村集体证书状态分布">
            {stats?.certStatus && stats.certStatus.length > 0 ? (
              <Pie {...pieConfig(stats.certStatus)} />
            ) : (
              <div style={{ height: 280, textAlign: 'center', lineHeight: '280px', color: '#999' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>

        {/* 操作概览 */}
        <Col span={8}>
          <Card title="各镇街统计">
            {stats?.townStats && stats.townStats.length > 0 ? (
              <Bar
                data={townChartData()}
                height={280}
                xField="townName"
                yField="value"
                seriesField="type"
                isGroup
                groupField="type"
                label={{ text: 'value', style: { fontSize: 10 } }}
                legend={{ position: 'right' }}
              />
            ) : (
              <div style={{ height: 280, textAlign: 'center', lineHeight: '280px', color: '#999' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 趋势分析 */}
      <Row gutter={16}>
        <Col span={24}>
          <Card title="趋势分析">
            {trendChartData.length > 0 ? (
              <Line {...trendConfig} data={trendChartData} />
            ) : (
              <div style={{ height: 300, textAlign: 'center', lineHeight: '300px', color: '#999' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  )
}
