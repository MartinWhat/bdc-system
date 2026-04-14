/**
 * 认证状态管理（Zustand）
 */

import { create } from 'zustand'
import { setToken, getToken, getUser, clearToken, initTokenManager } from '@/lib/token-manager'

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
    setToken(token, user)
    set({ token, user, isAuthenticated: true })
  },

  clearAuth: () => {
    clearToken()
    set({ token: null, user: null, isAuthenticated: false })
  },

  loadFromStorage: () => {
    const token = getToken()
    const user = getUser() as UserInfo | null

    if (token && user) {
      set({ token, user, isAuthenticated: true })
      initTokenManager()
    }
  },
}))
