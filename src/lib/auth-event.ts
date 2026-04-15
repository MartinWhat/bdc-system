/**
 * 全局认证事件监听器
 * 用于在应用任何地方触发 token 失效时的统一处理
 */

type AuthEventHandler = () => void

const listeners = new Set<AuthEventHandler>()

/**
 * 触发认证失效事件
 */
export function triggerAuthExpiry() {
  listeners.forEach((handler) => {
    try {
      handler()
    } catch (error) {
      console.error('Auth event handler error:', error)
    }
  })
}

/**
 * 注册认证失效事件监听器
 */
export function onAuthExpiry(handler: AuthEventHandler): () => void {
  listeners.add(handler)

  // 返回取消订阅函数
  return () => {
    listeners.delete(handler)
  }
}

/**
 * 清除所有监听器
 */
export function clearAuthListeners() {
  listeners.clear()
}
