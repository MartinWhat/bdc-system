/**
 * Cookie cleanup helpers for Better Auth.
 *
 * We keep this module intentionally tiny: the project now relies on Better Auth
 * session cookies directly, so the only remaining responsibility here is to
 * clear any session cookies during logout as a defensive fallback.
 */

import { NextResponse } from 'next/server'

const BETTER_AUTH_COOKIE_NAMES = [
  'better-auth.session_token',
  'better-auth.session_data',
  'better-auth.dont_remember',
  '__Secure-better-auth.session_token',
  '__Secure-better-auth.session_data',
  '__Secure-better-auth.dont_remember',
] as const

function deleteCookie(response: NextResponse, name: string) {
  response.headers.append('Set-Cookie', `${name}=; Path=/; SameSite=strict; HttpOnly; Max-Age=0`)
}

export function clearAuthCookies(response: NextResponse) {
  for (const cookieName of BETTER_AUTH_COOKIE_NAMES) {
    deleteCookie(response, cookieName)
  }
}
