/**
 * SM4 对称加密算法封装
 * 用于敏感数据加密（身份证号、手机号等）
 */

import { sm4 } from 'sm-crypto'

/**
 * SM4-CBC 加密
 * @param plaintext - 明文
 * @param key - 密钥（32 字符十六进制）
 * @param iv - 初始化向量（32 字符十六进制），不提供则自动生成
 * @returns { ciphertext: string, iv: string }
 */
export function sm4Encrypt(
  plaintext: string,
  key: string,
  iv?: string,
): { ciphertext: string; iv: string } {
  const finalIv = iv || generateIV()
  const ciphertext = sm4.encrypt(plaintext, key, { mode: 'cbc', iv: finalIv })
  return { ciphertext, iv: finalIv }
}

/**
 * SM4-CBC 解密
 * @param ciphertext - 密文
 * @param key - 密钥
 * @param iv - 初始化向量
 * @returns 明文
 */
export function sm4Decrypt(ciphertext: string, key: string, iv: string): string {
  return sm4.decrypt(ciphertext, key, { mode: 'cbc', iv })
}

/**
 * 生成随机 IV
 * @returns 十六进制 IV 字符串（32 字符）
 */
function generateIV(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 生成随机 SM4 密钥
 * @returns 十六进制密钥字符串（32 字符）
 */
export function generateSM4Key(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
