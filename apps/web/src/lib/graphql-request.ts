import axios from 'axios'
import { getAccessToken } from '@/lib/auth/auth-storage'
import { env } from '@/env'

export function getGraphqlUri(): string {
  return (
    env.VITE_GRAPHQL_ENDPOINT ??
    `${env.VITE_API_URL.replace(/\/$/, '').replace(/\/api$/, '')}/graphql`
  )
}

export async function graphqlRequest<TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const token = getAccessToken()
  const response = await axios.post<{
    data?: TData
    errors?: Array<{ message: string }>
  }>(
    getGraphqlUri(),
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  )

  if (response.data.errors?.length) {
    throw new Error(response.data.errors[0]?.message ?? 'GraphQL request failed')
  }

  if (!response.data.data) {
    throw new Error('GraphQL request returned no data')
  }

  return response.data.data
}
