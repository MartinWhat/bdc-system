/**
 * 工具函数统一导出
 */

export { maskIdCard, maskPhone, maskName, maskEmail, maskAddress, maskData } from './mask'
export {
  normalizeCertNo,
  getCertNoSearchKey,
  certNoMatches,
  splitCertNos,
  bdcMatchesCertNo,
} from './cert-no'
