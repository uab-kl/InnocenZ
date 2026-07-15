export interface AdminUser {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface AdminPagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface AdminsApiResponse {
  success: boolean
  message: string
  data: AdminUser[]
  pagination: AdminPagination
}

export interface AdminApiResponse {
  success: boolean
  message: string
  data: AdminUser
}

export interface AdminsQueryParams {
  email?: string
  status?: string
  page?: number
  pageSize?: number
}
