import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { CreateLimitTypeInput, UpdateLimitTypeInput } from './schemas'
import type {
  LimitTypeApiResponse,
  LimitTypesApiResponse,
  LimitTypesQueryParams,
} from './types'

export async function fetchLimitTypes(
  params: LimitTypesQueryParams = {},
  onRefreshFail: () => void,
): Promise<LimitTypesApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    code: params.code,
    name: params.name,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: LimitTypesApiResponse['data']
    pagination: LimitTypesApiResponse['pagination']
  }>(`/limit-type${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: response.data.data ?? [],
    pagination: response.data.pagination,
  }
}

export async function createLimitType(
  input: CreateLimitTypeInput,
  onRefreshFail: () => void,
): Promise<LimitTypeApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<LimitTypeApiResponse>('/limit-type', input)
  return response.data
}

export async function updateLimitType(
  id: string,
  input: UpdateLimitTypeInput,
  onRefreshFail: () => void,
): Promise<LimitTypeApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<LimitTypeApiResponse>(`/limit-type/${id}`, input)
  return response.data
}

export async function deactivateLimitType(
  id: string,
  onRefreshFail: () => void,
): Promise<LimitTypeApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.delete<LimitTypeApiResponse>(`/limit-type/${id}`)
  return response.data
}
