import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type {
  CreateSubscriptionFeatureInput,
  UpdateSubscriptionFeatureInput,
} from './schemas'
import type {
  SubscriptionFeatureApiResponse,
  SubscriptionFeaturesApiResponse,
  SubscriptionFeaturesQueryParams,
} from './types'

export async function fetchSubscriptionFeatures(
  params: SubscriptionFeaturesQueryParams = {},
  onRefreshFail: () => void,
): Promise<SubscriptionFeaturesApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    subscriptionId: params.subscriptionId,
    roleId: params.roleId,
    limitTypeId: params.limitTypeId,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: SubscriptionFeaturesApiResponse['data']
    pagination: SubscriptionFeaturesApiResponse['pagination']
  }>(`/subscription-feature${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: response.data.data ?? [],
    pagination: response.data.pagination,
  }
}

export async function createSubscriptionFeature(
  input: CreateSubscriptionFeatureInput,
  onRefreshFail: () => void,
): Promise<SubscriptionFeatureApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<SubscriptionFeatureApiResponse>(
    '/subscription-feature',
    input,
  )
  return response.data
}

export async function updateSubscriptionFeature(
  id: string,
  input: UpdateSubscriptionFeatureInput,
  onRefreshFail: () => void,
): Promise<SubscriptionFeatureApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<SubscriptionFeatureApiResponse>(
    `/subscription-feature/${id}`,
    input,
  )
  return response.data
}

export async function deleteSubscriptionFeature(
  id: string,
  onRefreshFail: () => void,
): Promise<SubscriptionFeatureApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.delete<SubscriptionFeatureApiResponse>(
    `/subscription-feature/${id}`,
  )
  return response.data
}
