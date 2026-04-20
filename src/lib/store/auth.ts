/**
 * 认证状态管理（Zustand）- Cookie 安全版
 * Token 存储在 httpOnly Cookie 中，前端仅管理用户信息
 */

import { create } from 'zustand'
import { initTokenManager, getTokenExpiry, isAccessTokenExpired } from '@/lib/token-manager'

export interface UserInfo {
  id: string
  username: string
  realName: string
  email?: string
  avatar?: string
  roles: string[]
  permissions: string[]
}

interface AuthState {
  user: UserInfo | null
  isAuthenticated: boolean
  tokenExpiry: number | null

  // Actions
  setAuth: (user: UserInfo, expiresIn?: number) => void
  clearAuth: () => void
  loadFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  tokenExpiry: null,

  setAuth: (user, expiresIn) => {
    if (expiresIn) {
      // Token 过期时间由 token-manager 管理
    }
    set({ user, isAuthenticated: true, tokenExpiry: getTokenExpiry() })
    initTokenManager()
  },

  clearAuth: () => {
    set({ user: null, isAuthenticated: false, tokenExpiry: null })
  },

  loadFromStorage: () => {
    // Cookie 模式下，Token 自动发送
    // 需要调用 /api/auth/me 获取用户信息
    // 这一步在 layout.tsx 中完成
    initTokenManager()
  },
}))
