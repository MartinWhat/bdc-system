/**
 * 通知浏览量阈值缓存
 *
 * 同一条通知在短时间内重复打开时，不再重复计入浏览量。
 */

const VIEW_CACHE_PREFIX = 'notification_view_last_recorded'
export const NOTIFICATION_VIEW_THRESHOLD_MS = 5 * 60 * 1000

function getCacheKey(notificationId: string) {
  return `${VIEW_CACHE_PREFIX}:${notificationId}`
}

export function shouldRecordNotificationView(notificationId: string) {
  if (typeof window === 'undefined') {
    return false
  }

  const raw = localStorage.getItem(getCacheKey(notificationId))
  if (!raw) {
    return true
  }

  const lastViewedAt = Number(raw)
  if (!Number.isFinite(lastViewedAt)) {
    return true
  }

  return Date.now() - lastViewedAt >= NOTIFICATION_VIEW_THRESHOLD_MS
}

export function recordNotificationView(notificationId: string) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(getCacheKey(notificationId), String(Date.now()))
}
