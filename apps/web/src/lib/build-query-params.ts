export function buildQueryParams(
  params: Record<string, string | number | undefined>,
): string {
  const queryParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      queryParams.append(key, String(value))
    }
  }

  const queryString = queryParams.toString()
  return queryString ? `?${queryString}` : ''
}
