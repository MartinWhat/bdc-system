'use client'

import { motion } from 'framer-motion'
import { STAGGER, STAGGER_CONTAINER } from '@/config/motion'
import type { ReactNode, CSSProperties } from 'react'

interface MotionListProps {
  children: ReactNode
  /** 列表项之间的延迟时间（秒） */
  staggerDelay?: number
  /** 初始延迟时间（秒） */
  initialDelay?: number
  /** 自定义每个项目的动画变体 */
  itemVariants?: typeof STAGGER
  /** 是否禁用动画 */
  disabled?: boolean
  /** 样式 */
  style?: CSSProperties
  /** 类名 */
  className?: string
}

/**
 * 带动画的列表容器
 * 为列表项提供交错进入动画效果
 */
export function MotionList({
  children,
  staggerDelay = 0.08,
  initialDelay = 0.1,
  itemVariants = STAGGER,
  disabled = false,
  className = '',
  style,
}: MotionListProps) {
  if (disabled) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={{
        animate: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: initialDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

interface MotionListItemProps {
  children: ReactNode
  /** 自定义索引，用于计算延迟 */
  index?: number
  /** 自定义动画变体 */
  variants?: typeof STAGGER
  /** 是否禁用动画 */
  disabled?: boolean
  /** 样式 */
  style?: CSSProperties
  /** 类名 */
  className?: string
}

/**
 * 列表项组件
 * 与 MotionList 配合使用，实现交错动画效果
 */
export function MotionListItem({
  children,
  index = 0,
  variants = STAGGER,
  disabled = false,
  className = '',
  style,
}: MotionListItemProps) {
  if (disabled) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      custom={index}
    >
      {children}
    </motion.div>
  )
}

/**
 * 带动画的列表项（使用自动索引）
 * 适合在 map 中直接使用
 */
export function MotionListItemAuto({
  children,
  variants = STAGGER,
  disabled = false,
  className = '',
  style,
}: Omit<MotionListItemProps, 'index'>) {
  if (disabled) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
    >
      {children}
    </motion.div>
  )
}

export default MotionList
