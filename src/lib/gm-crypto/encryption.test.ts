import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptSensitiveField,
  decryptSensitiveField,
  SENSITIVE_FIELDS,
} from '@/lib/gm-crypto/encryption'
import { generateQueryHash } from '@/lib/gm-crypto/query'
import { maskIdCard, maskPhone, maskName, maskAddress } from '@/lib/utils/mask'
import { seedTestKeys } from '@/test/helpers'

describe('敏感数据加密', () => {
  beforeAll(async () => {
    await seedTestKeys()
  })

  it('应该加密敏感字段并生成哈希', async () => {
    const result = await encryptSensitiveField('110101199001011234')
    expect(result.encrypted).toBeDefined()
    expect(result.hash).toHaveLength(64)
  })

  it('相同输入应该生成相同的哈希', async () => {
    const hash1 = await generateQueryHash('test')
    const hash2 = await generateQueryHash('test')
    expect(hash1).toBe(hash2)
  })

  it('加密后应该能够解密回原文', async () => {
    const plaintext = '13800138000'
    const { encrypted } = await encryptSensitiveField(plaintext)
    const decrypted = await decryptSensitiveField(encrypted)
    expect(decrypted).toBe(plaintext)
  })
})

describe('加密中间件', () => {
  beforeAll(async () => {
    await seedTestKeys()
  })

  it('应该加密配置的字段', async () => {
    const data = {
      idCard: '110101199001011234',
      phone: '13800138000',
      name: '张三',
    }

    // 手动加密敏感字段
    const idCardResult = await encryptSensitiveField(data.idCard)
    const phoneResult = await encryptSensitiveField(data.phone)

    const encrypted = {
      ...data,
      idCard: idCardResult.encrypted,
      idCardHash: idCardResult.hash,
      phone: phoneResult.encrypted,
      phoneHash: phoneResult.hash,
    }

    expect(encrypted.idCard).toBeDefined()
    expect(encrypted.idCardHash).toBeDefined()
    expect(encrypted.phoneHash).toBeDefined()
    expect(encrypted.name).toBe('张三') // 非敏感字段不变
  })

  it('应该能够解密回原始数据', async () => {
    const originalData = {
      idCard: '110101199001011234',
      name: '张三',
    }

    const { encrypted } = await encryptSensitiveField(originalData.idCard)
    const decrypted = await decryptSensitiveField(encrypted)

    expect(decrypted).toBe(originalData.idCard)
  })
})

describe('数据脱敏', () => {
  it('应该正确脱敏身份证号', () => {
    const masked = maskIdCard('110101199001011234')
    expect(masked).toBe('110***********1234')
  })

  it('应该正确脱敏手机号', () => {
    const masked = maskPhone('13800138000')
    expect(masked).toBe('138****8000')
  })

  it('应该正确脱敏姓名', () => {
    expect(maskName('张三')).toBe('张*')
    expect(maskName('张三丰')).toBe('张**')
  })

  it('应该正确脱敏地址', () => {
    const masked = maskAddress('北京市朝阳区建国路100号')
    // 地址脱敏：保留前3个字符，其余用 * 替换
    expect(masked).toBe('北京市**********')
  })

  it('短字符串应该不脱敏', () => {
    expect(maskIdCard('123')).toBe('123')
    expect(maskPhone('123')).toBe('123')
    expect(maskName('')).toBe('')
  })
})
