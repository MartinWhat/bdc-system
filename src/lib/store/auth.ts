/**
 * 认证状态管理（Zustand）- Cookie 安全版
 * Token 存储在 httpOnly Cookie 中，前端仅管理用户信息
 */

import { create } from 'zustand'

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

  // Actions
  setAuth: (user: UserInfo) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  setAuth: (user) => {
    set({ user, isAuthenticated: true })
  },

  clearAuth: () => {
    set({ user: null, isAuthenticated: false })
  },
}))
