import { getClient } from '@/lib/axios-v1'
import { buildQueryParams } from '@/lib/build-query-params'
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from './schemas'
import type {
  Subscription,
  SubscriptionApiResponse,
  SubscriptionsApiResponse,
  SubscriptionsQueryParams,
} from './types'

export async function fetchSubscriptions(
  params: SubscriptionsQueryParams = {},
  onRefreshFail: () => void,
): Promise<SubscriptionsApiResponse> {
  const client = getClient(onRefreshFail)
  const queryString = buildQueryParams({
    name: params.name,
    status: params.status,
    billingCycle: params.billingCycle,
    roleId: params.roleId,
    page: params.page,
    pageSize: params.pageSize,
  })

  const response = await client.get<{
    success: boolean
    message: string
    data: Array<Subscription & { roles?: Subscription['roles'] }>
    pagination: SubscriptionsApiResponse['pagination']
  }>(`/subscription${queryString}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: (response.data.data ?? []).map((subscription) => ({
      ...subscription,
      roles: subscription.roles ?? [],
    })),
    pagination: response.data.pagination,
  }
}

export async function createSubscription(
  input: CreateSubscriptionInput,
  onRefreshFail: () => void,
): Promise<SubscriptionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.post<{
    success: boolean
    message: string
    data: Subscription
  }>('/subscription', input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: response.data.data,
  }
}

export async function updateSubscription(
  id: string,
  input: UpdateSubscriptionInput,
  onRefreshFail: () => void,
): Promise<SubscriptionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.put<{
    success: boolean
    message: string
    data: Subscription
  }>(`/subscription/${id}`, input)

  return {
    success: response.data.success,
    message: response.data.message,
    data: response.data.data,
  }
}

export async function deactivateSubscription(
  id: string,
  onRefreshFail: () => void,
): Promise<SubscriptionApiResponse> {
  const client = getClient(onRefreshFail)
  const response = await client.delete<{
    success: boolean
    message: string
    data: Subscription
  }>(`/subscription/${id}`)

  return {
    success: response.data.success,
    message: response.data.message,
    data: response.data.data,
  }
}
