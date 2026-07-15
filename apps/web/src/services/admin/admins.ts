import { getClient } from '@/lib/axios-v1'
import { getRoleIdByName } from '@/services/rbac/roles'
import { buildQueryParams } from '@/lib/build-query-params'
import type { BackendUser } from './mappers'
import { mapAdminUser } from './mappers'
import type { CreateAdminInput } from './schemas'
import type {
  AdminApiResponse,
  AdminsApiResponse,
  AdminsQueryParams,
} from './types'

export async function fetchAdmins(
  params: AdminsQueryParams = {},
  onRefreshFail: () => void,
): Promise<AdminsApiResponse> {
  const adminRoleId = await getRoleIdByName('admin', onRefreshFail)
  if (!adminRoleId) {
    return {
      success: true,
      message: 'OK',
      data: [],
      pagination: {
        page: 1,
        pageSize: params.pageSize ?? 10,
        totalCount: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    }
  }

  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    email: params.email,
    status: params.status,
    roleId: adminRoleId,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: BackendUser[]
    pagination: AdminsApiResponse['pagination']
  }>(`/user${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: (response.data.data ?? []).map(mapAdminUser),
    pagination: response.data.pagination,
  }
}

export async function createAdmin(
  input: CreateAdminInput,
  onRefreshFail: () => void,
): Promise<AdminApiResponse> {
  const adminRoleId = await getRoleIdByName('admin', onRefreshFail)
  if (!adminRoleId) {
    throw new Error('Admin role not found')
  }

  const client = getClient(onRefreshFail)
  const response = await client.post<{
    success: boolean
    message: string
    data: BackendUser
  }>('/auth/register', {
    email: input.email,
    phoneNum: `+admin-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    username: input.displayName,
    password: input.password,
    roleId: adminRoleId,
  })

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapAdminUser(response.data.data),
  }
}
