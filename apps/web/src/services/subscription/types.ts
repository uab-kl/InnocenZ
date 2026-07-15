export type SubscriptionStatus = 'active' | 'inactive'
export type BillingCycle = 'weekly' | 'monthly' | 'annually'

export interface SubscriptionPagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface SubscriptionRoleSummary {
  id: string
  roleName: string
}

export interface Subscription {
  id: string
  name: string
  price: string
  billingCycle: BillingCycle
  status: SubscriptionStatus
  roles: SubscriptionRoleSummary[]
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface SubscriptionsApiResponse {
  success: boolean
  message: string
  pagination: SubscriptionPagination
  data: Subscription[]
}

export interface SubscriptionApiResponse {
  success: boolean
  message: string
  data: Subscription
}

export interface SubscriptionsQueryParams {
  name?: string
  status?: SubscriptionStatus
  billingCycle?: BillingCycle
  roleId?: string
  page?: number
  pageSize?: number
}

export interface LimitType {
  id: string
  code: string
  name: string
  description: string | null
  configSchema: Record<string, unknown> | null
  status: SubscriptionStatus
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface LimitTypesQueryParams {
  code?: string
  name?: string
  status?: SubscriptionStatus
  page?: number
  pageSize?: number
}

export interface LimitTypesApiResponse {
  success: boolean
  message: string
  pagination: SubscriptionPagination
  data: LimitType[]
}

export interface LimitTypeApiResponse {
  success: boolean
  message: string
  data: LimitType
}

export interface SubscriptionFeature {
  id: string
  subscriptionId: string | null
  roleId: string | null
  limitTypeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface SubscriptionFeaturesQueryParams {
  subscriptionId?: string
  roleId?: string
  limitTypeId?: string
  page?: number
  pageSize?: number
}

export interface SubscriptionFeaturesApiResponse {
  success: boolean
  message: string
  pagination: SubscriptionPagination
  data: SubscriptionFeature[]
}

export interface SubscriptionFeatureApiResponse {
  success: boolean
  message: string
  data: SubscriptionFeature
}
