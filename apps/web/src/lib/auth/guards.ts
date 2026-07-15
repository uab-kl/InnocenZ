import { redirect } from '@tanstack/react-router'
import { clearAuthTokens, getAccessToken } from '@/lib/auth/auth-storage'

export function ensureAuthenticated() {
  if (typeof window === 'undefined') return

  if (!getAccessToken()) {
    clearAuthTokens()
    throw redirect({ to: '/login' })
  }
}

export function kickToLogin() {
  clearAuthTokens()
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}
