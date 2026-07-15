import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import { profileQueryKey } from './use-profile'
import type { LoginRequest, LoginUser } from './auth-api'
import type { User } from '@/lib/auth'

function loginUserToProfile(user: LoginUser): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    contactNo: '',
    isActive: user.status === 'active',
    roles: [],
    readPermission: ['*'],
    createPermission: [],
    updatePermission: [],
  }
}

export function useAuthActions() {
  const { login: authLogin, logout: authLogout, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const response = await authLogin(credentials)

      if (response.data?.user) {
        queryClient.setQueryData(
          profileQueryKey,
          loginUserToProfile(response.data.user),
        )
      } else {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey })
      }

      return response
    },
    [authLogin, queryClient],
  )

  const logout = useCallback(() => {
    queryClient.removeQueries({ queryKey: profileQueryKey })
    authLogout()
  }, [authLogout, queryClient])

  return {
    login,
    logout,
    isAuthenticated,
  }
}
