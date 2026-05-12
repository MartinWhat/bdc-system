import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { customSession, username } from 'better-auth/plugins'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from './password'

type AuthUserContext = {
  id: string
  username: string
  displayUsername: string | null
  realName: string
  email: string | null
  avatar: string | null
  emailVerified: boolean
  status: string
  twoFactorEnabled: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type AuthRoleContext = {
  roles: string[]
  permissions: string[]
}

async function loadAuthContext(
  userId: string,
): Promise<(AuthUserContext & AuthRoleContext) | null> {
  const user = await prisma.sysUser.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!user) {
    return null
  }

  const roles = user.roles.map((userRole) => userRole.role.code)
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
      ),
    ),
  )

  return {
    id: user.id,
    username: user.username,
    displayUsername: user.displayUsername ?? null,
    realName: user.realName,
    email: user.email ?? null,
    avatar: user.avatar ?? null,
    emailVerified: user.emailVerified,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles,
    permissions,
  }
}

async function loadUsernameById(userId: string): Promise<string | null> {
  const user = await prisma.sysUser.findUnique({
    where: { id: userId },
    select: { username: true },
  })

  return user?.username ?? null
}

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ?? process.env.JWT_SECRET_KEY ?? 'bdc-better-auth-test-secret'

function resolveBaseURL() {
  const configuredURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL
  if (configuredURL) return configuredURL

  if (process.env.NODE_ENV === 'development') {
    const devPort = process.env.PORT ?? '3000'
    return `http://localhost:${devPort}`
  }

  return undefined
}

export const auth = betterAuth({
  secret: betterAuthSecret,
  baseURL: resolveBaseURL(),
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  user: {
    modelName: 'SysUser',
    fields: {
      name: 'realName',
      image: 'avatar',
      emailVerified: 'emailVerified',
    },
  },
  account: {
    modelName: 'AuthAccount',
  },
  session: {
    modelName: 'AuthSession',
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  verification: {
    modelName: 'AuthVerification',
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    password: {
      hash: async (password: string) => hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        verifyPassword(password, hash),
    },
  },
  plugins: [
    username({
      usernameNormalization: (value) => value.trim().toLowerCase(),
      displayUsernameNormalization: false,
    }),
    customSession(async ({ user, session }) => {
      const context = await loadAuthContext(user.id)

      if (!context) {
        return {
          user: {
            ...user,
            username: (await loadUsernameById(user.id)) ?? user.email ?? user.id,
            realName: user.name,
            displayUsername: user.name,
            avatar: user.image ?? null,
            emailVerified: user.emailVerified,
            status: 'DISABLED',
            twoFactorEnabled: false,
            lastLoginAt: null,
          },
          session,
          roles: [],
          permissions: [],
        }
      }

      return {
        user: {
          ...user,
          username: context.username,
          realName: context.realName,
          displayUsername: context.displayUsername ?? context.realName,
          avatar: context.avatar,
          emailVerified: context.emailVerified,
          status: context.status,
          twoFactorEnabled: context.twoFactorEnabled,
          lastLoginAt: context.lastLoginAt,
        },
        session,
        roles: context.roles,
        permissions: context.permissions,
      }
    }),
    nextCookies(),
  ],
})

export async function getAuthContextByUserId(userId: string) {
  return loadAuthContext(userId)
}

export function getLegacyUserSummary(context: (AuthUserContext & AuthRoleContext) | null): {
  id: string
  username: string
  realName: string
  email: string | null
  avatar: string | null
  status?: string
  twoFactorEnabled?: boolean
  roles: string[]
  permissions: string[]
} | null {
  if (!context) {
    return null
  }

  return {
    id: context.id,
    username: context.username,
    realName: context.realName,
    email: context.email,
    avatar: context.avatar,
    status: context.status,
    twoFactorEnabled: context.twoFactorEnabled,
    roles: context.roles,
    permissions: context.permissions,
  }
}

export function appendSetCookieHeaders(target: Headers, source: Headers) {
  const getSetCookie = source as Headers & { getSetCookie?: () => string[] }
  const cookies = typeof getSetCookie.getSetCookie === 'function' ? getSetCookie.getSetCookie() : []

  if (cookies.length > 0) {
    for (const cookie of cookies) {
      target.append('Set-Cookie', cookie)
    }
    return
  }

  const single = source.get('set-cookie')
  if (single) {
    target.append('Set-Cookie', single)
  }
}
