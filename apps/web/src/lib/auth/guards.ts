import { redirect } from '@tanstack/react-router'
import { clearAuthTokens, getAccessToken } from '@/lib/auth/auth-storage'
import { hardNavigate } from '@/lib/hard-navigate'
import { deLocalizeHref } from '@/paraglide/runtime'

export function ensureAuthenticated() {
  if (typeof window === 'undefined') return

  if (!getAccessToken()) {
    clearAuthTokens()
    throw redirect({ to: '/login' })
  }
}

export function kickToLogin() {
  clearAuthTokens()
  if (typeof window === 'undefined') return

  // Both halves have to account for the locale prefix: the live pathname is
  // `/en/login`, so comparing it to '/login' never matched and the guard
  // re-assigned the location even when already on the login screen.
  if (deLocalizeHref(window.location.pathname) !== '/login') {
    hardNavigate('/login')
  }
}
