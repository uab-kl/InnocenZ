import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { BackendRolePermissionGroup } from './mappers'
import { mapRolePermissionGroup } from './mappers'
import type { RolePermissionsApiResponse } from './types'

export async function fetchRolePermissions(
  roleId: string,
  onRefreshFail: () => void,
): Promise<RolePermissionsApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({ roleId })
  const response = await client.get<{
    success: boolean
    message: string
    data: BackendRolePermissionGroup[]
  }>(`/rbac/role-permission${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: (response.data.data ?? []).map(mapRolePermissionGroup),
  }
}

export async function syncRolePermissions(
  roleId: string,
  permissionIds: string[],
  onRefreshFail: () => void,
): Promise<RolePermissionsApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: BackendRolePermissionGroup[]
  }>(`/rbac/role-permission/update/${roleId}`, { permissionIds })

  return {
    success: response.data.success,
    message: response.data.message,
    data: (response.data.data ?? []).map(mapRolePermissionGroup),
  }
}
