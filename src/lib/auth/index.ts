/**
 * 认证模块统一导出
 */

export { signJWT, verifyJWT, extractTokenFromHeader } from './jwt'
export {
  hashUserPassword,
  validateUserPassword,
  generateSessionToken,
  hasPermission,
  hasRole,
} from './utils'
export {
  createUser,
  findUserByUsername,
  validateUserCredentials,
  updateLastLogin,
  getUserPermissions,
  getUserRoles,
} from './user-service'
