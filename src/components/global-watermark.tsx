'use client'

import { useEffect, useState } from 'react'
import { Watermark } from 'antd'
import { usePathname } from 'next/navigation'
import dayjs from 'dayjs'
import { useAuthStore } from '@/lib/store/auth'
import { useThemeStore } from '@/lib/store/theme'

export default function GlobalWatermark({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)
  const { isDark } = useThemeStore()
  const [sessionChecked, setSessionChecked] = useState(false)
  const isLoginPage = pathname?.startsWith('/login')

  useEffect(() => {
    if (isLoginPage || user || sessionChecked) {
      return
    }

    let cancelled = false

    const loadSessionUser = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        })

        if (!response.ok) {
          return
        }

        const payload = await response.json()
        const userData = payload?.data

        if (!cancelled && userData) {
          setAuth({
            id: userData.id,
            username: userData.username || userData.realName || '',
            realName: userData.realName || userData.username || '',
            roles: Array.isArray(userData.roles) ? userData.roles : [],
            permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
          })
        }
      } catch (error) {
        console.error('Failed to load watermark session user:', error)
      } finally {
        if (!cancelled) {
          setSessionChecked(true)
        }
      }
    }

    void loadSessionUser()

    return () => {
      cancelled = true
    }
  }, [isLoginPage, setAuth, sessionChecked, user])

  const watermarkText = user?.realName?.trim() || user?.username?.trim() || ''

  if (isLoginPage || !watermarkText) {
    return <>{children}</>
  }

  return (
    <Watermark
      content={[watermarkText, dayjs().format('YYYY-MM-DD')]}
      gap={[180, 120]}
      font={{
        color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        fontSize: 12,
        fontWeight: 400,
      }}
      zIndex={9}
    >
      {children}
    </Watermark>
  )
}
