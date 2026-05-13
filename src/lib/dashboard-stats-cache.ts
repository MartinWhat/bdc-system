/**
 * 工作台首页统计缓存
 *
 * 仅缓存首页最上方的汇总数字，避免每次刷新都重新请求统计接口。
 */

export interface DashboardStats {
  overview: {
    totalUsers: number
    totalBdc: number
    totalCert: number
    totalReceive: number
  }
  pendingTasks: {
    total: number
    pendingBdc?: number
    pendingCertApprove?: number
    pendingReceive?: number
    pendingObjection?: number
  }
}

interface DashboardStatsCacheEntry {
  updatedAt: number
  data: DashboardStats
}

const CACHE_PREFIX = 'dashboard_stats_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

function getCacheKey(userId: string) {
  return `${CACHE_PREFIX}:${userId}`
}

export function readDashboardStatsCache(userId: string) {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(getCacheKey(userId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DashboardStatsCacheEntry>
    if (
      !parsed ||
      typeof parsed.updatedAt !== 'number' ||
      !parsed.data ||
      typeof parsed.data.overview?.totalUsers !== 'number' ||
      typeof parsed.data.pendingTasks?.total !== 'number'
    ) {
      return null
    }

    return {
      data: parsed.data,
      isFresh: Date.now() - parsed.updatedAt < CACHE_TTL_MS,
    }
  } catch {
    return null
  }
}

export function writeDashboardStatsCache(userId: string, data: DashboardStats) {
  if (typeof window === 'undefined') {
    return
  }

  const payload: DashboardStatsCacheEntry = {
    updatedAt: Date.now(),
    data,
  }

  localStorage.setItem(getCacheKey(userId), JSON.stringify(payload))
}

export function clearDashboardStatsCache(userId: string) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(getCacheKey(userId))
}
