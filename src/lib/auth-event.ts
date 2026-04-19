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
  console.log('[auth-event] triggerAuthExpiry called, listeners count:', listeners.size)
  listeners.forEach((handler) => {
    try {
      console.log('[auth-event] Calling listener')
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
