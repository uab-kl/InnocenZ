import { getAccessToken } from './auth-storage'

export interface AccessTokenPayload {
  loginMethod: 'email' | 'phone'
  loginCriteria: string
}

export function decodeAccessTokenPayload(): AccessTokenPayload | null {
  const token = getAccessToken()
  if (!token) return null

  try {
    const segment = token.split('.')[1]
    if (!segment) return null

    const payload = JSON.parse(atob(segment)) as Partial<AccessTokenPayload>
    if (!payload.loginMethod || !payload.loginCriteria) return null

    return {
      loginMethod: payload.loginMethod,
      loginCriteria: payload.loginCriteria,
    }
  } catch {
    return null
  }
}
