import { redirect } from '@tanstack/react-router'
import { env } from '@/env'
import { clearAuthTokens, getAccessToken } from '@/lib/auth/auth-storage'
import { getClient } from '@/lib/axios-v1'
import { hardNavigate } from '@/lib/hard-navigate'
import { deLocalizeHref } from '@/paraglide/runtime'

export function ensureAuthenticated() {
  if (typeof window === 'undefined') return

  if (!getAccessToken()) {
    clearAuthTokens()
    throw redirect({ to: '/login' })
  }
}

interface MeRole {
  id: string
  roleName: string
}

// One /auth/me round-trip per token: the admin gate runs on EVERY /admin
// navigation, and the verdict cannot change without a new login.
let adminGate: { token: string; verdict: 'admin' | 'agency' | 'outlet' | 'other' } | null = null

/**
 * The /admin tree is for the admin role ONLY (TEST_SCRIPT §4d). Other
 * authenticated sessions used to browse the admin shell and collect 403s —
 * the backend already refuses their data (requireAdmin routers); this closes
 * the front door too: agency → /agency, outlet → /outlet, anything else
 * (e.g. a PR token) → /no-access. A failed role lookup kicks to /login
 * (fail closed) rather than letting an unknown token sit on admin pages.
 */
export async function ensureAdminPortal() {
  if (typeof window === 'undefined') return
  ensureAuthenticated()
  const token = getAccessToken() as string

  let verdict = adminGate?.token === token ? adminGate.verdict : null
  if (!verdict) {
    let roles: MeRole[]
    try {
      const res = await getClient(kickToLogin).get<{ data?: { roles?: MeRole[] } }>('/auth/me')
      roles = res.data?.data?.roles ?? []
    } catch {
      clearAuthTokens()
      throw redirect({ to: '/login' })
    }
    verdict = roles.some((r) => r.roleName === 'admin')
      ? 'admin'
      : roles.some((r) => r.roleName === 'agency' || r.id === env.VITE_AGENCY_ROLE_ID)
        ? 'agency'
        : roles.some((r) => r.roleName === 'outlet' || r.id === env.VITE_OUTLET_ROLE_ID)
          ? 'outlet'
          : 'other'
    adminGate = { token, verdict }
  }

  if (verdict === 'agency') throw redirect({ to: '/agency' })
  if (verdict === 'outlet') throw redirect({ to: '/outlet' })
  if (verdict === 'other') throw redirect({ to: '/no-access' })
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
