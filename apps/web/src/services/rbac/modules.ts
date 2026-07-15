import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { BackendModule } from './mappers'
import { mapModule } from './mappers'
import type { CreateModuleInput, UpdateModuleInput } from './schemas'
import type {
  ModuleApiResponse,
  ModulesApiResponse,
  ModulesQueryParams,
} from './types'

export async function fetchModules(
  params: ModulesQueryParams = {},
  onRefreshFail: () => void,
): Promise<ModulesApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    moduleName: params.moduleName,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: BackendModule[]
    pagination: ModulesApiResponse['pagination']
  }>(`/rbac/module${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    pagination: response.data.pagination,
    data: (response.data.data ?? []).map(mapModule),
  }
}

export async function fetchModuleById(
  moduleId: string,
  onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.get<{
    success: boolean
    message: string
    data: BackendModule
  }>(`/rbac/module/${moduleId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapModule(response.data.data),
  }
}

export async function createModule(
  input: CreateModuleInput,
  onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<{
    success: boolean
    message: string
    data: BackendModule
  }>('/rbac/module', input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapModule(response.data.data),
  }
}

export async function updateModule(
  moduleId: string,
  input: UpdateModuleInput,
  onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: BackendModule
  }>(`/rbac/module/${moduleId}`, input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapModule(response.data.data),
  }
}

export async function deactivateModule(
  moduleId: string,
  onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.delete<{
    success: boolean
    message: string
    data: BackendModule
  }>(`/rbac/module/${moduleId}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: mapModule(response.data.data),
  }
}
