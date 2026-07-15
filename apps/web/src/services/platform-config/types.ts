export interface PlatformConfig {
  id: string
  platformFeePercent: string
  geofenceRadiusMeters: number
  subscriptionMonthlyFee: string
  duplicatePaymentWindowHours: number
  currency: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface PlatformConfigApiResponse {
  success: boolean
  message: string
  data: PlatformConfig
}
