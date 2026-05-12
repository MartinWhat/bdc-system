'use client'

import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'
import { twoFactorClient, usernameClient } from 'better-auth/client/plugins'
import { openTwoFactorLoginChallenge } from '@/lib/store/two-factor-login'

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect: async ({ twoFactorMethods }) => {
        openTwoFactorLoginChallenge(twoFactorMethods)
      },
    }),
  ],
})
