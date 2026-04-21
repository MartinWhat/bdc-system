/**
 * 统一动画配置
 * 使用 Framer Motion 的动画参数配置
 */

// 动画时长配置（毫秒）
export const DURATION = {
  FAST: 0.2,
  NORMAL: 0.3,
  SLOW: 0.4,
  SLIDER: 0.5,
} as const

// 缓动函数配置
export const EASING = {
  EASE_OUT: [0.0, 0.0, 0.2, 1],
  EASE_IN_OUT: [0.4, 0.0, 0.2, 1],
  EASE_IN: [0.4, 0.0, 1, 1],
  EASE_OUT_BACK: [0.34, 1.56, 0.64, 1],
  EASE_OUT_ELASTIC: [0.68, -0.55, 0.265, 1.55],
} as const

// 淡入动画
export const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 淡入 + 上滑动画
export const SLIDE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 淡入 + 下滑动画
export const SLIDE_DOWN = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 淡入 + 左滑动画
export const SLIDE_LEFT = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 淡入 + 右滑动画
export const SLIDE_RIGHT = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 缩放进入动画
export const SCALE_IN = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 缩放强调动画
export const SCALE_EMPHASIS = {
  initial: { scale: 1 },
  animate: { scale: 1.05 },
  exit: { scale: 1 },
  transition: {
    duration: DURATION.FAST,
    ease: EASING.EASE_OUT_BACK,
  },
} as const

// 交错动画配置（用于列表）
export const STAGGER = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 16 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 交错容器配置
export const STAGGER_CONTAINER = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
} as const

// 脉冲动画（用于加载/提示）
export const PULSE = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.05, 1] },
  transition: {
    duration: DURATION.SLOW,
    repeat: Infinity,
    ease: EASING.EASE_IN_OUT,
  },
} as const

// 旋转动画
export const ROTATE = {
  initial: { rotate: 0 },
  animate: { rotate: 360 },
  transition: {
    duration: 1,
    repeat: Infinity,
    ease: EASING.EASE_IN_OUT,
  },
} as const

// 悬浮动画
export const FLOAT = {
  initial: { y: 0 },
  animate: { y: [-8, 8, -8] },
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: EASING.EASE_IN_OUT,
  },
} as const

// 展开动画
export const EXPAND = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: {
    duration: DURATION.NORMAL,
    ease: EASING.EASE_OUT,
  },
} as const

// 页面过渡动画
export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: {
    duration: DURATION.SLOW,
    ease: EASING.EASE_OUT,
  },
} as const

// 卡片动画变体
export const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.NORMAL,
      ease: EASING.EASE_OUT,
    },
  },
  hover: {
    y: -4,
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.12)',
    transition: {
      duration: DURATION.FAST,
      ease: EASING.EASE_OUT_BACK,
    },
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: DURATION.FAST,
    },
  },
} as const

// 按钮微动画
export const BUTTON_VARIANTS = {
  hover: {
    scale: 1.02,
    transition: { duration: DURATION.FAST },
  },
  tap: {
    scale: 0.98,
    transition: { duration: DURATION.FAST },
  },
} as const

// 图标动画
export const ICON_VARIANTS = {
  idle: { rotate: 0 },
  active: {
    rotate: 360,
    transition: { duration: DURATION.NORMAL, ease: EASING.EASE_OUT_BACK },
  },
  hover: {
    scale: 1.1,
    transition: { duration: DURATION.FAST, ease: EASING.EASE_OUT_BACK },
  },
} as const

// 菜单项动画
export const MENU_ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION.FAST,
      ease: EASING.EASE_OUT,
    },
  },
  hover: {
    x: 4,
    transition: { duration: DURATION.FAST, ease: EASING.EASE_OUT },
  },
} as const

// 导出所有动画配置的映射
export const motionConfigs = {
  fadeIn: FADE_IN,
  slideUp: SLIDE_UP,
  slideDown: SLIDE_DOWN,
  slideLeft: SLIDE_LEFT,
  slideRight: SLIDE_RIGHT,
  scaleIn: SCALE_IN,
  stagger: STAGGER,
  staggerContainer: STAGGER_CONTAINER,
  pulse: PULSE,
  rotate: ROTATE,
  float: FLOAT,
  expand: EXPAND,
  pageTransition: PAGE_TRANSITION,
  card: CARD_VARIANTS,
  button: BUTTON_VARIANTS,
  icon: ICON_VARIANTS,
  menuItem: MENU_ITEM_VARIANTS,
} as const

// 工具函数：根据索引计算延迟
export const getStaggerDelay = (index: number, baseDelay = 0.05) => ({
  delay: index * baseDelay,
})

// 工具函数：创建自定义过渡
export const createTransition = (overrides: Partial<typeof FADE_IN.transition> = {}) => ({
  ...FADE_IN.transition,
  ...overrides,
})
