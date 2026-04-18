'use client'

import { Switch } from 'antd'
import { useThemeStore } from '@/lib/store/theme'
import { SunOutlined, MoonOutlined } from '@ant-design/icons'

/**
 * 主题切换按钮组件
 */
export default function ThemeToggle() {
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <Switch
      checked={isDark}
      onChange={toggleTheme}
      checkedChildren={<MoonOutlined />}
      unCheckedChildren={<SunOutlined />}
      size="small"
      aria-label="切换暗黑模式"
    />
  )
}
