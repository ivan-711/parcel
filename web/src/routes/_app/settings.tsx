import { createFileRoute } from '@tanstack/react-router'

import { Settings } from '../../features/settings/settings'
import { meQuery } from '../../lib/api/queries'

export const Route = createFileRoute('/_app/settings')({
  loader: ({ context }) => context.queryClient.query({ ...meQuery, staleTime: 'static' }),
  component: Settings,
})
