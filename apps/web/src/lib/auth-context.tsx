import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { hasValidTokens } from '@/lib/auth/auth-storage'
import { kickToLogin } from '@/lib/auth/guards'
import {
  login as apiLogin,
  type LoginRequest,
  type LoginResponse,
  type ApiResponse,
} from '@/lib/auth/auth-api'

interface AuthContextType {
  isAuthenticated: boolean
  setAuthenticated: (value: boolean) => void
  login: (credentials: LoginRequest) => Promise<ApiResponse<LoginResponse>>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    setIsAuthenticated(hasValidTokens())
  }, [])

  const setAuthenticated = useCallback((value: boolean) => {
    setIsAuthenticated(value)
  }, [])

  const login = useCallback(async (credentials: LoginRequest) => {
    const loginResponse = await apiLogin(credentials)

    if (!loginResponse.success) {
      throw new Error(loginResponse.message || 'Login failed')
    }

    setIsAuthenticated(true)
    return loginResponse
  }, [])

  const logout = useCallback(() => {
    setIsAuthenticated(false)
    kickToLogin()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        setAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
