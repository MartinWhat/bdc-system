import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const getSessionCookieMock = vi.fn()
const getSessionMock = vi.fn()

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: (...args: unknown[]) => getSessionCookieMock(...args),
}))

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}))

import { authMiddleware, getUserFromRequest } from '@/lib/middleware/auth'

describe('authMiddleware', () => {
  beforeEach(() => {
    getSessionCookieMock.mockReturnValue('session-cookie')
    getSessionMock.mockResolvedValue({
      user: {
        id: 'user-123',
        username: 'alice',
        status: 'ACTIVE',
      },
      roles: ['ADMIN'],
      permissions: ['user:read'],
    })
  })

  it('应该把 Better Auth 用户上下文注入到下游请求头', async () => {
    const request = new NextRequest('http://localhost/api/users')

    const nextSpy = vi.spyOn(NextResponse, 'next')
    const response = await authMiddleware(request)

    expect(response).not.toBeNull()
    expect(nextSpy).toHaveBeenCalledTimes(1)

    const callArgs = nextSpy.mock.calls[0]?.[0] as
      | { request?: { headers?: HeadersInit } }
      | undefined
    const forwardedHeaders = new Headers(callArgs?.request?.headers)

    expect(forwardedHeaders.get('x-user-id')).toBe('user-123')
    expect(forwardedHeaders.get('x-username')).toBe(encodeURIComponent('alice'))
    expect(JSON.parse(decodeURIComponent(forwardedHeaders.get('x-user-roles') || '[]'))).toEqual([
      'ADMIN',
    ])
    expect(
      JSON.parse(decodeURIComponent(forwardedHeaders.get('x-user-permissions') || '[]')),
    ).toEqual(['user:read'])

    const routedUser = getUserFromRequest(
      new NextRequest('http://localhost/api/users', { headers: forwardedHeaders }),
    )
    expect(routedUser).toEqual({
      userId: 'user-123',
      username: 'alice',
      roles: ['ADMIN'],
      permissions: ['user:read'],
    })
  })
})
