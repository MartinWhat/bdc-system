import { describe, it, expect } from 'vitest'
import {
  sm3Hash,
  sm3Hmac,
  generateSalt,
  encryptPassword,
  verifyPassword,
} from '@/lib/gm-crypto/sm3'
import { sm4Encrypt, sm4Decrypt, generateSM4Key } from '@/lib/gm-crypto/sm4'

describe('SM3 哈希算法', () => {
  it('应该生成固定长度的哈希值', () => {
    const hash = sm3Hash('test')
    expect(hash).toHaveLength(64) // 32 字节 = 64 个十六进制字符
  })

  it('相同输入应该生成相同的哈希', () => {
    const hash1 = sm3Hash('test')
    const hash2 = sm3Hash('test')
    expect(hash1).toBe(hash2)
  })

  it('不同输入应该生成不同的哈希', () => {
    const hash1 = sm3Hash('test1')
    const hash2 = sm3Hash('test2')
    expect(hash1).not.toBe(hash2)
  })
})

describe('SM3-HMAC', () => {
  it('应该生成固定长度的 HMAC', () => {
    const hmac = sm3Hmac('message', 'key')
    expect(hmac).toHaveLength(64)
  })

  it('相同消息和密钥应该生成相同的 HMAC', () => {
    const hmac1 = sm3Hmac('message', 'key')
    const hmac2 = sm3Hmac('message', 'key')
    expect(hmac1).toBe(hmac2)
  })

  it('不同密钥应该生成不同的 HMAC', () => {
    const hmac1 = sm3Hmac('message', 'key1')
    const hmac2 = sm3Hmac('message', 'key2')
    expect(hmac1).not.toBe(hmac2)
  })
})

describe('盐值生成', () => {
  it('应该生成指定长度的盐值', () => {
    const salt = generateSalt(16)
    expect(salt).toHaveLength(32) // 16 字节 = 32 个十六进制字符
  })

  it('每次生成的盐值应该不同', () => {
    const salt1 = generateSalt()
    const salt2 = generateSalt()
    expect(salt1).not.toBe(salt2)
  })
})

describe('密码加密', () => {
  it('应该加密密码并返回哈希和盐', () => {
    const { hash, salt } = encryptPassword('password123')
    expect(hash).toHaveLength(64)
    expect(salt).toHaveLength(32)
  })

  it('使用相同密码和盐应该生成相同的哈希', () => {
    const result1 = encryptPassword('password123')
    const result2 = encryptPassword('password123', result1.salt)
    expect(result1.hash).toBe(result2.hash)
  })

  it('应该正确验证密码', () => {
    const { hash, salt } = encryptPassword('password123')
    const isValid = verifyPassword('password123', hash, salt)
    expect(isValid).toBe(true)
  })

  it('错误密码应该验证失败', () => {
    const { hash, salt } = encryptPassword('password123')
    const isValid = verifyPassword('wrongpassword', hash, salt)
    expect(isValid).toBe(false)
  })
})

describe('SM4 加密', () => {
  it('应该能够加密和解密数据', () => {
    const key = generateSM4Key()
    const plaintext = '敏感数据'

    const { ciphertext, iv } = sm4Encrypt(plaintext, key)
    const decrypted = sm4Decrypt(ciphertext, key, iv)

    expect(decrypted).toBe(plaintext)
  })

  it('相同明文不同 IV 应该生成不同密文', () => {
    const key = generateSM4Key()
    const plaintext = 'test'

    const result1 = sm4Encrypt(plaintext, key)
    const result2 = sm4Encrypt(plaintext, key)

    expect(result1.ciphertext).not.toBe(result2.ciphertext)
  })

  it('错误密钥应该无法解密', () => {
    const key1 = generateSM4Key()
    const key2 = generateSM4Key()
    const plaintext = 'secret'

    const { ciphertext, iv } = sm4Encrypt(plaintext, key1)

    expect(() => sm4Decrypt(ciphertext, key2, iv)).toThrow()
  })
})
