import React from 'react'
import { Typography, Card, Spin, Empty } from 'antd'
import type { ReactNode } from 'react'

const { Title } = Typography

interface PageContainerProps {
  /** 页面标题 */
  title?: ReactNode
  /** 页面副标题 */
  subTitle?: ReactNode
  /** 页面内容 */
  children: ReactNode
  /** 是否显示加载中状态 */
  loading?: boolean
  /** 是否为空状态 */
  empty?: boolean
  /** 空状态描述 */
  emptyDescription?: string
  /** 额外操作区域 */
  extra?: ReactNode
  /** 自定义样式 */
  className?: string
  /** 是否使用卡片包裹 */
  card?: boolean
  /** 卡片样式 */
  cardStyle?: React.CSSProperties
  /** 内容区域样式 */
  contentStyle?: React.CSSProperties
  /** 数据源，用于自动判断空状态 */
  dataSource?: unknown[]
}

/**
 * 统一页面容器组件
 * 提供标准的页面布局结构，包含标题、内容区域、加载和空状态处理
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  subTitle,
  children,
  loading = false,
  empty = false,
  emptyDescription = '暂无数据',
  extra,
  className = '',
  card = false,
  cardStyle,
  contentStyle,
  dataSource,
}) => {
  // 自动判断空状态：如果提供了 dataSource 且为空数组，则显示空状态
  const isEmpty = dataSource !== undefined ? dataSource.length === 0 : empty

  const content = (
    <div
      className={className}
      style={{
        padding: '24px',
        background: '#fff',
        minHeight: 'calc(100vh - 112px)',
        ...contentStyle,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <div>
            {title && (
              <Title level={3} style={{ margin: 0, marginBottom: subTitle ? '8px' : 0 }}>
                {title}
              </Title>
            )}
            {subTitle && (
              <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
                {subTitle}
              </Typography.Text>
            )}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="加载中..." />
        </div>
      ) : isEmpty ? (
        <Empty description={emptyDescription} style={{ padding: '60px 0' }} />
      ) : (
        children
      )}
    </div>
  )

  if (card) {
    return <Card style={{ margin: '24px 16px', ...cardStyle }}>{content}</Card>
  }

  return content
}

export default PageContainer
