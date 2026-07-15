import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken } from '@/lib/auth/auth-storage'
import { env } from '@/env'

let browserClient: AxiosInstance | null = null

function createClient(onRefreshFail: () => void): AxiosInstance {
  const instance = axios.create({
    baseURL: `${env.VITE_API_URL}/v1`,
    headers: { 'Content-Type': 'application/json' },
  })

  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getAccessToken()
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => Promise.reject(error),
  )

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        onRefreshFail()
      }

      return Promise.reject(error)
    },
  )

  return instance
}

export function getClient(onRefreshFail: () => void): AxiosInstance {
  if (!browserClient) {
    browserClient = createClient(onRefreshFail)
  }
  return browserClient
}

let publicClient: AxiosInstance | null = null

function createPublicClient(): AxiosInstance {
  return axios.create({
    baseURL: `${env.VITE_API_URL}/v1`,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function getPublicClient(): AxiosInstance {
  if (!publicClient) {
    publicClient = createPublicClient()
  }
  return publicClient
}
