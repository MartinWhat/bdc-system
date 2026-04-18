/**
 * 主题状态管理（Zustand）- 支持暗黑模式切换
 */

import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  theme: ThemeMode
  isDark: boolean

  // Actions
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  loadFromStorage: () => void
}

const THEME_STORAGE_KEY = 'app_theme'

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'light',
  isDark: false,

  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    set({
      theme,
      isDark: theme === 'dark',
    })
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.isDark ? 'light' : 'dark'
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
      return {
        theme: newTheme,
        isDark: !state.isDark,
      }
    })
  },

  loadFromStorage: () => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
    if (stored === 'light' || stored === 'dark') {
      set({
        theme: stored,
        isDark: stored === 'dark',
      })
    }
  },
}))
