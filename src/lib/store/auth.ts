/**
 * 认证状态管理（Zustand）
 */

import { create } from 'zustand'

export interface UserInfo {
  id: string
  username: string
  realName: string
  email?: string
  avatar?: string
  roles: string[]
}

interface AuthState {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean

  // Actions
  setAuth: (token: string, user: UserInfo) => void
  clearAuth: () => void
  loadFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  clearAuth: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as UserInfo
        set({ token, user, isAuthenticated: true })
      } catch {
        set({ token: null, user: null, isAuthenticated: false })
      }
    }
  },
}))
