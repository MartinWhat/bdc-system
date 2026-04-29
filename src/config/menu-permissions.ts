/**
 * 菜单权限配置
 * 定义每个菜单项所需的权限代码
 */

export interface MenuItemPermission {
  key: string
  requiredPermissions?: string[]
}

/**
 * 菜单权限映射
 * key: 菜单路由
 * value: 所需的权限代码列表（满足任一即可）
 */
export const MENU_PERMISSIONS: Record<string, string[]> = {
  // 主菜单
  '/': [], // 工作台无需权限
  '/bdc': ['bdc:read'],
  '/lingzheng': ['bdc:read'],
  '/objection': ['objection:read'], // 异议管理
  '/objection/workflow': ['objection:manage'], // 异议流程配置
  '/collective': ['collective:read'],
  '/stats': ['stats:read'],
  '/notifications': ['notification:view'],
  '/profile': [], // 个人信息无需特殊权限
  '/contacts': ['contact:read'], // 通讯录

  // 系统设置
  '/users': ['user:manage'],
  '/roles': ['role:manage'],
  '/towns': ['town:manage'],
  '/villages': ['village:manage'],
  '/notifications/manage': ['notification:manage'],
  '/logs': ['log:view'],
  '/kms': ['kms:manage'],
  '/kms/migrate': ['kms:manage'],
}

/**
 * 检查用户是否有访问某个菜单的权限
 * @param pathname - 菜单路由
 * @param userPermissions - 用户权限列表
 * @returns 是否有权限
 */
export function hasMenuPermission(pathname: string, userPermissions: string[]): boolean {
  const requiredPermissions = MENU_PERMISSIONS[pathname]

  // 如果没有配置权限要求，则允许访问
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true
  }

  // 检查用户是否有任一所需权限
  return userPermissions.some((permission) => requiredPermissions.includes(permission))
}
