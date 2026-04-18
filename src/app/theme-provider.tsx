'use client'

import { useEffect } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useThemeStore } from '@/lib/store/theme'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isDark, loadFromStorage } = useThemeStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      {children}
    </ConfigProvider>
  )
}
