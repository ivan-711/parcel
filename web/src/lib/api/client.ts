import createClient from 'openapi-fetch'

import { session } from '../session'
import type { paths } from './schema'

export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' })

api.use({
  async onRequest({ request }) {
    const token = await session.token()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
})

/** The API's problem+json body. */
export interface Problem {
  code: string
  title: string
  status: number
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    title: string,
  ) {
    super(title)
  }
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'code' in value && 'title' in value
}

/** Narrow an openapi-fetch result to its data, throwing a typed error otherwise. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data
  const { status } = result.response
  if (isProblem(result.error)) throw new ApiError(status, result.error.code, result.error.title)
  throw new ApiError(status, 'unknown', `Request failed with status ${status}`)
}
