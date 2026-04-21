'use client'

import { motion } from 'framer-motion'
import { BUTTON_VARIANTS } from '@/config/motion'
import type { ReactNode } from 'react'
import { Button } from 'antd'
import type { ButtonProps } from 'antd'

interface MotionButtonProps extends ButtonProps {
  children: ReactNode
  /** 是否禁用动画 */
  disabledAnimation?: boolean
  /** 自定义动画变体 */
  variants?: typeof BUTTON_VARIANTS
}

/**
 * 带动画的按钮组件
 * 基于 Ant Design Button，添加 hover 和点击微动画效果
 */
export function MotionButton({
  children,
  disabledAnimation = false,
  variants = BUTTON_VARIANTS,
  ...buttonProps
}: MotionButtonProps) {
  if (disabledAnimation || buttonProps.disabled) {
    return (
      <Button disabled={buttonProps.disabled} {...buttonProps}>
        {children}
      </Button>
    )
  }

  return (
    <motion.div
      whileHover="hover"
      whileTap="tap"
      variants={variants}
      style={{ display: 'inline-block' }}
    >
      <Button {...buttonProps}>{children}</Button>
    </motion.div>
  )
}

/**
 * 带动画的图标按钮
 */
export function MotionIconButton({
  children,
  disabledAnimation = false,
  variants = BUTTON_VARIANTS,
  ...buttonProps
}: MotionButtonProps) {
  if (disabledAnimation || buttonProps.disabled) {
    return (
      <Button disabled={buttonProps.disabled} {...buttonProps}>
        {children}
      </Button>
    )
  }

  return (
    <motion.div
      whileHover="hover"
      whileTap="tap"
      variants={variants}
      style={{ display: 'inline-block' }}
    >
      <Button shape="circle" {...buttonProps}>
        {children}
      </Button>
    </motion.div>
  )
}

export default MotionButton
