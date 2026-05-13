import { describe, expect, it } from 'vitest'
import { getRequestIp, resolveAuthAuditEvent } from './audit'

describe('auth audit helpers', () => {
  it('resolves username login events', () => {
    expect(resolveAuthAuditEvent('/sign-in/username')).toEqual({
      action: 'LOGIN',
      description: '用户名密码登录',
    })
  })

  it('resolves passkey login events', () => {
    expect(resolveAuthAuditEvent('/passkey/verify-authentication')).toEqual({
      action: 'LOGIN',
      description: 'Passkey 登录',
    })
  })

  it('resolves logout events', () => {
    expect(resolveAuthAuditEvent('/sign-out')).toEqual({
      action: 'LOGOUT',
      description: '用户登出',
    })
  })

  it('extracts the first forwarded IP', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.8, 10.0.0.1',
    })

    expect(getRequestIp(headers)).toBe('203.0.113.8')
  })
})
