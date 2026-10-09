import { createFileRoute } from '@tanstack/react-router'

import { Compare } from '../../features/compare/compare'
import { dealsQuery } from '../../lib/api/queries'

export interface CompareSearch {
  ids?: string[]
}

export const Route = createFileRoute('/_app/compare')({
  validateSearch: (search: Record<string, unknown>): CompareSearch => {
    const raw = search.ids
    const ids = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string')
      : typeof raw === 'string'
        ? [raw]
        : []
    return ids.length ? { ids } : {}
  },
  loader: ({ context }) => context.queryClient.query({ ...dealsQuery, staleTime: 'static' }),
  component: ComparePage,
})

function ComparePage() {
  const { ids = [] } = Route.useSearch()
  return <Compare ids={ids} />
}
