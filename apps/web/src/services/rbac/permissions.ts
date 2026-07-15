import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { BackendPermission } from './mappers'
import { mapPermission } from './mappers'
import type { CreatePermissionInput, UpdatePermissionInput } from './schemas'
import type {
  PermissionApiResponse,
  PermissionsApiResponse,
  PermissionsQueryParams,
} from './types'

export async function fetchPermissions(
  params: PermissionsQueryParams = {},
  onRefreshFail: () => void,
): Promise<PermissionsApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    moduleId: params.moduleId,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: BackendPermission[]
    pagination: PermissionsApiResponse['pagination']
  }>(`/rbac/permission${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    pagination: response.data.pagination,
    data: (response.data.data ?? []).map(mapPermission),
  }
}

export async function fetchPermissionById(
  permissionId: string,
  onRefreshFail: () => void,
): Promise<PermissionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.get<{
    success: boolean
    message: string
    data: BackendPermission
  }>(`/rbac/permission/${permissionId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapPermission(response.data.data),
  }
}

export async function createPermission(
  input: CreatePermissionInput,
  onRefreshFail: () => void,
): Promise<PermissionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<{
    success: boolean
    message: string
    data: BackendPermission
  }>('/rbac/permission', input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapPermission(response.data.data),
  }
}

export async function updatePermission(
  permissionId: string,
  input: UpdatePermissionInput,
  onRefreshFail: () => void,
): Promise<PermissionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: BackendPermission
  }>(`/rbac/permission/${permissionId}`, input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapPermission(response.data.data),
  }
}

export async function deactivatePermission(
  permissionId: string,
  onRefreshFail: () => void,
): Promise<PermissionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.delete<{
    success: boolean
    message: string
    data: BackendPermission
  }>(`/rbac/permission/${permissionId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapPermission(response.data.data),
  }
}
