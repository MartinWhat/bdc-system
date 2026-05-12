import { create } from 'zustand'

interface TwoFactorLoginState {
  challengeActive: boolean
  methods: string[]
  openChallenge: (methods?: string[]) => void
  clearChallenge: () => void
}

export const useTwoFactorLoginStore = create<TwoFactorLoginState>((set) => ({
  challengeActive: false,
  methods: [],
  openChallenge: (methods = []) =>
    set({
      challengeActive: true,
      methods,
    }),
  clearChallenge: () =>
    set({
      challengeActive: false,
      methods: [],
    }),
}))

export function openTwoFactorLoginChallenge(methods?: string[]) {
  useTwoFactorLoginStore.getState().openChallenge(methods)
}

export function clearTwoFactorLoginChallenge() {
  useTwoFactorLoginStore.getState().clearChallenge()
}
