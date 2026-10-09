import { createFileRoute } from '@tanstack/react-router'

import { Pipeline } from '../../features/pipeline/pipeline'
import { dealsQuery } from '../../lib/api/queries'

export const Route = createFileRoute('/_app/pipeline')({
  loader: ({ context }) => context.queryClient.query({ ...dealsQuery, staleTime: 'static' }),
  head: () => ({ meta: [{ title: 'Pipeline' }, { name: 'robots', content: 'noindex' }] }),
  component: Pipeline,
})
