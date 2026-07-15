import { Building2, Store } from 'lucide-react'
import type { UserTypeKey } from '@/constants/user-types'

export type SignupAccountType = Extract<UserTypeKey, 'outlet' | 'agency'>

export const signupAccountTypes = [
  {
    key: 'outlet' as const,
    title: 'Outlet',
    description: 'Venue operators managing floor staff, shifts, and nightly sales.',
    icon: Store,
  },
  {
    key: 'agency' as const,
    title: 'PR Agency',
    description: 'PR agencies managing rosters, workforce, and payroll across venues.',
    icon: Building2,
  },
] as const

export function isSignupAccountType(value: string): value is SignupAccountType {
  return value === 'outlet' || value === 'agency'
}

export function getSignupAccountType(key: string) {
  return signupAccountTypes.find((type) => type.key === key)
}
