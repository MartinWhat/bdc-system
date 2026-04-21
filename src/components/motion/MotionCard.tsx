'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { CARD_VARIANTS } from '@/config/motion'
import type { ReactNode } from 'react'
import { Card } from 'antd'
import type { CardProps } from 'antd'

interface MotionCardProps extends Omit<CardProps, 'children'> {
  children: ReactNode
  /** 是否禁用动画 */
  disabled?: boolean
  /** 自定义动画变体 */
  variants?: typeof CARD_VARIANTS
  /** 点击回调 */
  onClick?: () => void
  /** 是否可点击（添加点击缩放效果） */
  clickable?: boolean
}

/**
 * 带动画的卡片组件
 * 基于 Ant Design Card，添加 hover 和点击动画效果
 */
export function MotionCard({
  children,
  disabled = false,
  variants = CARD_VARIANTS,
  onClick,
  clickable = false,
  className = '',
  style,
  hoverable = true,
  ...cardProps
}: MotionCardProps) {
  if (disabled) {
    return (
      <Card className={className} style={style} hoverable={hoverable} {...cardProps}>
        {children}
      </Card>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      whileHover="hover"
      whileTap={clickable ? 'tap' : undefined}
      variants={variants}
      onClick={onClick}
      style={{
        height: '100%',
        ...style,
      }}
      className={className}
    >
      <Card hoverable={hoverable} {...cardProps}>
        {children}
      </Card>
    </motion.div>
  )
}

export default MotionCard
