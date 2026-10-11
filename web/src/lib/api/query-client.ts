import { QueryClient } from '@tanstack/react-query'

import { session } from '../session'
import { ApiError } from './client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

// Loaders mark their queries static, so without this the next identity would be
// served the last one's deals and settings straight from the cache.
session.onIdentityChange(() => queryClient.clear())
