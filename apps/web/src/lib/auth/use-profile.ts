import { useQuery } from '@tanstack/react-query'
import { getClient } from '@/lib/axios-v1'
import { kickToLogin } from '@/lib/auth/guards'
import { getAccessToken, hasValidTokens } from '@/lib/auth/auth-storage'
import { decodeAccessTokenPayload } from '@/lib/auth/jwt'
import type { User } from '@/lib/auth'

interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

interface BackendUser {
  id: string
  email: string | null
  phoneNum: string | null
  username: string
  status: string
}

export const profileQueryKey = ['auth', 'profile'] as const

async function fetchProfile(): Promise<User> {
  const accessToken = getAccessToken()
  if (!accessToken) {
    throw new Error('No access token available')
  }

  const tokenPayload = decodeAccessTokenPayload()
  if (!tokenPayload) {
    throw new Error('Invalid access token')
  }

  const client = getClient(kickToLogin)
  const query =
    tokenPayload.loginMethod === 'email'
      ? `email=${encodeURIComponent(tokenPayload.loginCriteria)}`
      : `phoneNum=${encodeURIComponent(tokenPayload.loginCriteria)}`

  const response = await client.get<ApiResponse<BackendUser[]>>(
    `/user?${query}&pageSize=1`,
  )

  if (!response.data.success || !response.data.data?.[0]) {
    throw new Error(response.data.message || 'Failed to fetch profile')
  }

  const profile = response.data.data[0]

  return {
    id: profile.id,
    email: profile.email ?? '',
    displayName: profile.username,
    contactNo: profile.phoneNum ?? '',
    isActive: profile.status.toLowerCase() === 'active',
    roles: [],
    readPermission: ['*'],
    createPermission: [],
    updatePermission: [],
  }
}

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    enabled: hasValidTokens(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
