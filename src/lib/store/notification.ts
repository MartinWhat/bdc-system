/**
 * 通知状态管理（Zustand）
 */

import { create } from 'zustand'

export interface NotificationItem {
  id: string
  title: string
  content: string
  type: 'SYSTEM' | 'POLICY' | 'ANNOUNCEMENT'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  publishedAt?: string
}

interface NotificationState {
  // 弹窗相关
  popupQueue: NotificationItem[]
  currentPopup: NotificationItem | null
  popupVisible: boolean

  // 已读记录 (本地缓存)
  readIds: Set<string>

  // Actions
  setPopupQueue: (notifications: NotificationItem[]) => void
  addPopup: (notification: NotificationItem) => void
  removePopup: (id: string) => void
  showNextPopup: () => void
  closePopup: () => void
  markAsRead: (id: string) => void
  loadReadIds: () => void
  isRead: (id: string) => boolean
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  popupQueue: [],
  currentPopup: null,
  popupVisible: false,
  readIds: new Set(),

  setPopupQueue: (notifications) => {
    set({ popupQueue: notifications })
  },

  addPopup: (notification) => {
    set((state) => ({
      popupQueue: [...state.popupQueue, notification],
    }))
  },

  removePopup: (id) => {
    set((state) => ({
      popupQueue: state.popupQueue.filter((n) => n.id !== id),
    }))
  },

  showNextPopup: () => {
    const { popupQueue, readIds } = get()
    // 找到第一个未读的通知
    const nextNotification = popupQueue.find((n) => !readIds.has(n.id))

    if (nextNotification) {
      set({
        currentPopup: nextNotification,
        popupVisible: true,
      })
    }
  },

  closePopup: () => {
    const { currentPopup } = get()
    if (currentPopup) {
      set((state) => ({
        readIds: new Set([...state.readIds, currentPopup.id]),
        popupVisible: false,
        currentPopup: null,
      }))
    }
  },

  markAsRead: (id) => {
    set((state) => ({
      readIds: new Set([...state.readIds, id]),
    }))
  },

  loadReadIds: () => {
    // 从 localStorage 加载已读记录
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('notification_read_ids')
      if (stored) {
        try {
          const ids = JSON.parse(stored)
          set({ readIds: new Set(ids) })
        } catch {
          // ignore
        }
      }
    }
  },

  isRead: (id) => {
    return get().readIds.has(id)
  },
}))

// 持久化已读记录到 localStorage
if (typeof window !== 'undefined') {
  useNotificationStore.subscribe((state) => {
    localStorage.setItem('notification_read_ids', JSON.stringify([...state.readIds]))
  })
}
