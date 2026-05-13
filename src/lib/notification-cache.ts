/**
 * 通知卡缓存
 *
 * 仅缓存首页上方展示的最近通知列表，减少每次刷新都重新请求。
 */

import type { NotificationItem } from '@/lib/store/notification'

interface NotificationCacheEntry {
  updatedAt: number
  list: NotificationItem[]
}

const CACHE_PREFIX = 'notification_card_cache'
const CACHE_TTL_MS = 3 * 60 * 1000

function getCacheKey(userId: string) {
  return `${CACHE_PREFIX}:${userId}`
}

export function readNotificationCardCache(userId: string) {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(getCacheKey(userId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationCacheEntry>
    if (!parsed || typeof parsed.updatedAt !== 'number' || !Array.isArray(parsed.list)) {
      return null
    }

    return {
      list: parsed.list,
      isFresh: Date.now() - parsed.updatedAt < CACHE_TTL_MS,
    }
  } catch {
    return null
  }
}

export function writeNotificationCardCache(userId: string, list: NotificationItem[]) {
  if (typeof window === 'undefined') {
    return
  }

  const payload: NotificationCacheEntry = {
    updatedAt: Date.now(),
    list,
  }

  localStorage.setItem(getCacheKey(userId), JSON.stringify(payload))
}

export function clearNotificationCardCache(userId: string) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(getCacheKey(userId))
}
