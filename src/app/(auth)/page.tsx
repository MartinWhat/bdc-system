'use client'

import { useEffect, useState } from 'react'
import { Row, Col, Statistic, message, Tag, Empty } from 'antd'
import {
  UserOutlined,
  HomeOutlined,
  FileTextOutlined,
  BarChartOutlined,
  BellOutlined,
  TeamOutlined,
  FolderOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import NotificationCard from '@/components/notifications/NotificationCard'
import NotificationPopup from '@/components/notifications/NotificationPopup'
import { MotionCard, MotionContainer } from '@/components/motion'
import { authFetch } from '@/lib/api-fetch'
import {
  readDashboardStatsCache,
  writeDashboardStatsCache,
  type DashboardStats,
} from '@/lib/dashboard-stats-cache'
import { useAuthStore } from '@/lib/store/auth'
import styles from './page.module.css'

const QUICK_ACTIONS = [
  {
    key: 'bdc',
    title: '宅基地管理',
    description: '录入、审核和查看宅基地档案',
    href: '/bdc',
    icon: HomeOutlined,
  },
  {
    key: 'lingzheng',
    title: '领证管理',
    description: '办理发放与领证登记',
    href: '/lingzheng',
    icon: FileTextOutlined,
  },
  {
    key: 'collective',
    title: '村集体证书',
    description: '管理村集体所有权证书',
    href: '/collective',
    icon: TeamOutlined,
  },
  {
    key: 'notifications',
    title: '通知发布',
    description: '创建和发布系统通知',
    href: '/notifications/manage',
    icon: BellOutlined,
  },
  {
    key: 'stats',
    title: '统计报表',
    description: '查看趋势和汇总报表',
    href: '/stats',
    icon: BarChartOutlined,
  },
  {
    key: 'attachments',
    title: '附件库',
    description: '管理扫描件和照片附件',
    href: '/attachments',
    icon: FolderOutlined,
  },
]

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // 显示用户名
  const displayName = user?.realName || user?.username || '加载中...'
  const canViewStats =
    !!user &&
    (user.roles.includes('ADMIN') ||
      user.roles.includes('STATS_VIEWER') ||
      user.permissions.includes('stats:read'))

  useEffect(() => {
    if (!user) return

    if (!canViewStats) {
      setLoading(false)
      return
    }

    let cancelled = false
    const cached = readDashboardStatsCache(user.id)

    if (cached) {
      setStats(cached.data)
      setLoading(false)

      if (cached.isFresh) {
        return () => {
          cancelled = true
        }
      }
    } else {
      setLoading(true)
    }

    const loadDashboardStats = async () => {
      try {
        const response = await authFetch('/api/stats')
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          if (response.status !== 401 && response.status !== 403) {
            message.error(payload?.error || '加载工作台统计失败')
          }
          return
        }

        if (!cancelled && payload?.success) {
          setStats(payload.data)
          writeDashboardStatsCache(user.id, payload.data)
        } else if (!cancelled) {
          message.error(payload?.error || '加载工作台统计失败')
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Load dashboard stats error:', error)
          message.error('加载工作台统计失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboardStats()

    return () => {
      cancelled = true
    }
  }, [user, canViewStats])

  const statValue = (value: number | undefined) => {
    if (!canViewStats) return '--'
    if (!stats) return '--'
    return typeof value === 'number' ? value : 0
  }

  const pendingTasks = stats?.pendingTasks
  const todayTasks = [
    {
      key: 'pendingBdc',
      title: '待审核宅基地',
      description: '需要尽快处理的宅基地申请',
      count: pendingTasks?.pendingBdc ?? 0,
      href: '/bdc',
      tone: 'blue',
    },
    {
      key: 'pendingCertApprove',
      title: '待审核证书',
      description: '村集体证书的入库审批',
      count: pendingTasks?.pendingCertApprove ?? 0,
      href: '/collective',
      tone: 'purple',
    },
    {
      key: 'pendingReceive',
      title: '待领证',
      description: '已发放但尚未领证完成',
      count: pendingTasks?.pendingReceive ?? 0,
      href: '/lingzheng',
      tone: 'orange',
    },
    {
      key: 'pendingObjection',
      title: '待处理异议',
      description: '需要跟进的异议和申诉',
      count: pendingTasks?.pendingObjection ?? 0,
      href: '/objection',
      tone: 'red',
    },
  ]

  return (
    <MotionContainer>
      <PageContainer title="工作台" subTitle={`欢迎回来，${displayName}`}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard loading={loading && canViewStats}>
              <Statistic
                title="用户总数"
                value={statValue(stats?.overview.totalUsers)}
                prefix={<UserOutlined />}
              />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard loading={loading && canViewStats}>
              <Statistic
                title="宅基地档案"
                value={statValue(stats?.overview.totalBdc)}
                prefix={<HomeOutlined />}
              />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard loading={loading && canViewStats}>
              <Statistic
                title="领证记录"
                value={statValue(stats?.overview.totalReceive)}
                prefix={<FileTextOutlined />}
              />
            </MotionCard>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MotionCard loading={loading && canViewStats}>
              <Statistic
                title="待处理事项"
                value={statValue(stats?.pendingTasks.total)}
                prefix={<BarChartOutlined />}
              />
            </MotionCard>
          </Col>
        </Row>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24}>
            <MotionCard hoverable={false} bodyStyle={{ padding: 16 }}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <div className={styles.panelIcon}>
                    <BarChartOutlined />
                  </div>
                  <div>
                    <div className={styles.panelTitleRow}>
                      <span className={styles.panelTitle}>快捷入口</span>
                      <Tag color="geekblue">常用</Tag>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.quickStrip}>
                {QUICK_ACTIONS.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.quickItem}
                      onClick={() => router.push(item.href)}
                      title={item.description}
                    >
                      <div className={styles.quickIcon}>
                        <Icon />
                      </div>
                      <div className={styles.quickContent}>
                        <div className={styles.quickTitleRow}>
                          <span className={styles.quickTitle}>{item.title}</span>
                          <RightOutlined className={styles.quickArrow} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </MotionCard>
          </Col>
        </Row>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} lg={12}>
            <MotionCard hoverable={false} bodyStyle={{ padding: 16 }}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <div className={styles.panelIcon}>
                    <BarChartOutlined />
                  </div>
                  <div>
                    <div className={styles.panelTitleRow}>
                      <span className={styles.panelTitle}>今日待办</span>
                      <Tag color="blue">{pendingTasks?.total ?? 0} 项</Tag>
                    </div>
                  </div>
                </div>
                <a className={styles.panelLink} onClick={() => router.push('/stats')}>
                  查看统计 <RightOutlined />
                </a>
              </div>

              {canViewStats ? (
                <div className={styles.todoList}>
                  {todayTasks.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={styles.todoItem}
                      onClick={() => router.push(item.href)}
                    >
                      <div className={styles.todoMain}>
                        <div className={styles.todoTitleRow}>
                          <span className={`${styles.todoDot} ${styles[`tone${item.tone}`]}`} />
                          <span className={styles.todoTitle}>{item.title}</span>
                        </div>
                        <div className={styles.todoDesc}>{item.description}</div>
                      </div>
                      <div className={styles.todoMeta}>
                        <span className={styles.todoCount}>{item.count}</span>
                        <RightOutlined className={styles.todoArrow} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty description="暂无权限查看待办" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </MotionCard>
          </Col>
          <Col xs={24} lg={12}>
            <MotionCard>
              <NotificationCard />
            </MotionCard>
          </Col>
        </Row>
        <NotificationPopup />
      </PageContainer>
    </MotionContainer>
  )
}
