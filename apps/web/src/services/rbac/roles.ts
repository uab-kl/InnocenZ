import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { BackendRole } from './mappers'
import { mapRole } from './mappers'
import type { CreateRoleInput, UpdateRoleInput } from './schemas'
import type {
  RoleApiResponse,
  RolesApiResponse,
  RolesQueryParams,
} from './types'

export async function fetchRoles(
  params: RolesQueryParams = {},
  onRefreshFail: () => void,
): Promise<RolesApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    roleName: params.roleName ?? params.roleId,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: BackendRole[]
    pagination: RolesApiResponse['pagination']
  }>(`/rbac/role${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    pagination: response.data.pagination,
    data: (response.data.data ?? []).map(mapRole),
  }
}

export async function fetchRoleById(
  roleId: string,
  onRefreshFail: () => void,
): Promise<RoleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.get<{
    success: boolean
    message: string
    data: BackendRole
  }>(`/rbac/role/${roleId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapRole(response.data.data),
  }
}

export async function createRole(
  input: CreateRoleInput,
  onRefreshFail: () => void,
): Promise<RoleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<{
    success: boolean
    message: string
    data: BackendRole
  }>('/rbac/role', input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapRole(response.data.data),
  }
}

export async function updateRole(
  roleId: string,
  input: UpdateRoleInput,
  onRefreshFail: () => void,
): Promise<RoleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: BackendRole
  }>(`/rbac/role/${roleId}`, input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapRole(response.data.data),
  }
}

export async function deactivateRole(
  roleId: string,
  onRefreshFail: () => void,
): Promise<RoleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: BackendRole
  }>(`/rbac/role/inactive/${roleId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapRole(response.data.data),
  }
}

export async function getRoleIdByName(
  roleName: string,
  onRefreshFail: () => void,
): Promise<string | null> {
  const response = await fetchRoles({ roleName }, onRefreshFail)
  const role = response.data.find(
    (item) => item.roleName.toLowerCase() === roleName.toLowerCase(),
  )
  return role?.roleId ?? null
}
