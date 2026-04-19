/**
 * 认证状态管理（Zustand）- 双 Token 机制
 */

import { create } from 'zustand'
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  getUser,
  clearTokens,
  initTokenManager,
} from '@/lib/token-manager'

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
  accessToken: string | null
  refreshToken: string | null
  user: UserInfo | null
  isAuthenticated: boolean

  // Actions
  setAuth: (accessToken: string, refreshToken: string, user: UserInfo) => void
  clearAuth: () => void
  loadFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: (accessToken, refreshToken, user) => {
    setTokens(accessToken, refreshToken, user)
    set({ accessToken, refreshToken, user, isAuthenticated: true })
  },

  clearAuth: () => {
    clearTokens()
    set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false })
  },

  loadFromStorage: () => {
    const accessToken = getAccessToken()
    const refreshToken = getRefreshToken()
    const user = getUser() as UserInfo | null

    if (accessToken && refreshToken && user) {
      set({ accessToken, refreshToken, user, isAuthenticated: true })
      initTokenManager()
    }
  },
}))
