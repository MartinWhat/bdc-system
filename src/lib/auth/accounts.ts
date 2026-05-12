import { prisma } from '@/lib/prisma'

const CREDENTIAL_PROVIDER_ID = 'credential'

export async function upsertCredentialAccount(userId: string, passwordHash: string) {
  return prisma.authAccount.upsert({
    where: {
      providerId_accountId: {
        providerId: CREDENTIAL_PROVIDER_ID,
        accountId: userId,
      },
    },
    create: {
      userId,
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER_ID,
      password: passwordHash,
    },
    update: {
      userId,
      password: passwordHash,
    },
  })
}

export async function findCredentialAccount(userId: string) {
  return prisma.authAccount.findUnique({
    where: {
      providerId_accountId: {
        providerId: CREDENTIAL_PROVIDER_ID,
        accountId: userId,
      },
    },
  })
}

export async function deleteCredentialAccount(userId: string) {
  return prisma.authAccount.deleteMany({
    where: {
      providerId: CREDENTIAL_PROVIDER_ID,
      accountId: userId,
    },
  })
}
