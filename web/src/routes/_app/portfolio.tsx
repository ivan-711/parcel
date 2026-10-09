import { createFileRoute } from '@tanstack/react-router'

import { Portfolio } from '../../features/portfolio/portfolio'
import { portfolioQuery } from '../../lib/api/queries'

export const Route = createFileRoute('/_app/portfolio')({
  loader: ({ context }) => context.queryClient.query({ ...portfolioQuery, staleTime: 'static' }),
  head: () => ({ meta: [{ title: 'Portfolio' }, { name: 'robots', content: 'noindex' }] }),
  component: Portfolio,
})
