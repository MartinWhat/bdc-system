import React from 'react'
import { Typography, Card, Spin, Empty, Skeleton, theme } from 'antd'
import { motion } from 'framer-motion'
import { PAGE_TRANSITION, PULSE } from '@/config/motion'
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
  /** 骨架屏配置，为 true 时使用骨架屏替代 Spin */
  skeleton?:
    | boolean
    | {
        /** 是否显示动画 */
        active?: boolean
        /** 是否显示头像占位 */
        avatar?: boolean
        /** 段落配置 */
        paragraph?: { rows: number }
      }
  /** 是否禁用页面进入动画 */
  disableAnimation?: boolean
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
  skeleton = false,
  disableAnimation = false,
}) => {
  const { token } = theme.useToken()

  // 自动判断空状态：如果提供了 dataSource 且为空数组，则显示空状态
  const isEmpty = dataSource !== undefined ? dataSource.length === 0 : empty

  // 解析骨架屏配置
  const skeletonConfig =
    typeof skeleton === 'boolean'
      ? { active: true, avatar: false, paragraph: { rows: 3 } }
      : {
          active: skeleton.active ?? true,
          avatar: skeleton.avatar ?? false,
          paragraph: skeleton.paragraph ?? { rows: 3 },
        }

  const content = (
    <div
      className={className}
      style={{
        padding: '24px',
        background: token.colorBgContainer,
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
          {skeleton ? (
            <Skeleton {...skeletonConfig} style={{ width: '100%', maxWidth: 800 }} />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Spin size="large" tip="加载中..." />
            </motion.div>
          )}
        </div>
      ) : isEmpty ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Empty description={emptyDescription} style={{ padding: '60px 0' }} />
        </motion.div>
      ) : (
        children
      )}
    </div>
  )

  if (card) {
    return <Card style={{ margin: '24px 16px', ...cardStyle }}>{content}</Card>
  }

  if (disableAnimation) {
    return content
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={PAGE_TRANSITION}
      style={{ height: '100%' }}
    >
      {content}
    </motion.div>
  )
}

export default PageContainer
