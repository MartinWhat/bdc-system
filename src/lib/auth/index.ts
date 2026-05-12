/**
 * 认证模块统一导出
 */

export { hashUserPassword, validateUserPassword, hasPermission, hasRole } from './utils'
export { passwordNeedsRehash } from './utils'
export {
  createUser,
  findUserByUsername,
  validateUserCredentials,
  updateLastLogin,
  getUserPermissions,
  getUserRoles,
} from './user-service'
export { getCurrentUser, getCurrentUserId, withAuth } from './middleware'
export type { AuthenticatedUser } from './middleware'
export { getDataPermissionFilter, buildBdcWhereClause } from './data-permission'
export type { DataScope, DataPermissionFilter } from './data-permission'
