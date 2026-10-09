import { createFileRoute } from '@tanstack/react-router'

import { DealList } from '../../features/deals/list'
import { dealsQuery } from '../../lib/api/queries'

export interface Search {
  q?: string
}

export const Route = createFileRoute('/_app/deals/')({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.q === 'string' && search.q ? { q: search.q } : {},
  loader: ({ context }) => context.queryClient.query({ ...dealsQuery, staleTime: 'static' }),
  component: DealsPage,
})

function DealsPage() {
  const { q = '' } = Route.useSearch()
  return <DealList q={q} />
}
