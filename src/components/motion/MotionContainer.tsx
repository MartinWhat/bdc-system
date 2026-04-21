'use client'

import { motion, type HTMLMotionProps, type Variants } from 'framer-motion'
import { PAGE_TRANSITION, STAGGER_CONTAINER } from '@/config/motion'
import type { ReactNode } from 'react'

interface MotionContainerProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: ReactNode
  /** 是否使用交错动画容器 */
  stagger?: boolean
  /** 自定义动画变体 */
  variants?: Variants
}

/**
 * 通用页面动画容器
 * 为页面内容提供淡入 + 轻微上滑的进入动画
 */
export function MotionContainer({
  children,
  stagger = false,
  variants,
  ...props
}: MotionContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={stagger ? { ...STAGGER_CONTAINER, ...variants } : variants || PAGE_TRANSITION}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export default MotionContainer
