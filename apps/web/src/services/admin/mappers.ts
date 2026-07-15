import type { AdminUser } from './types'

export interface BackendUser {
  id: string
  email: string | null
  phoneNum: string | null
  username: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export function mapAdminUser(user: BackendUser): AdminUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: user.username,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    createdBy: user.createdBy,
    updatedBy: user.updatedBy,
  }
}
