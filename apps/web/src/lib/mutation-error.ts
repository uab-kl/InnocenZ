import axios from 'axios'
import { getErrorMessage } from '@/lib/utils'

export function toMutationError(
  error: unknown,
  fallback: string,
): Error | null {
  if (!error) return null
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string })?.message
    return new Error(message || fallback)
  }
  if (error instanceof Error) return error
  return new Error(getErrorMessage(error))
}
