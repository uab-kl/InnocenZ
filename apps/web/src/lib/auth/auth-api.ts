import { getPublicClient } from '@/lib/axios-v1'
import { saveAuthTokens, clearAuthTokens } from './auth-storage'

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginUser {
  id: string
  email: string
  displayName: string
  status: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: LoginUser
}

function parseTokenExpiry(data: LoginResponse): number {
  if (data.expiresAt) {
    return new Date(data.expiresAt).getTime()
  }

  const legacyExpiry = (data as LoginResponse & { expiredAt?: number }).expiredAt
  if (legacyExpiry) return legacyExpiry

  return Date.now() + 7 * 24 * 60 * 60 * 1000
}

export async function login(
  credentials: LoginRequest,
): Promise<ApiResponse<LoginResponse>> {
  const client = getPublicClient()
  const response = await client.post<ApiResponse<LoginResponse>>(
    '/auth/login',
    credentials,
  )

  if (response.data.success && response.data.data) {
    const { accessToken, refreshToken } = response.data.data
    saveAuthTokens(
      accessToken,
      refreshToken,
      parseTokenExpiry(response.data.data),
    )
  }

  return response.data
}

export function logout(): void {
  clearAuthTokens()
}
