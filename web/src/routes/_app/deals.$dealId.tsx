import { createFileRoute, notFound } from '@tanstack/react-router'

import { Workspace } from '../../features/deals/workspace/workspace'
import { ApiError } from '../../lib/api/client'
import { dealQuery } from '../../lib/api/queries'

export const Route = createFileRoute('/_app/deals/$dealId')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.query({ ...dealQuery(params.dealId), staleTime: 'static' })
    } catch (error) {
      // Someone else's deal and a made up id look the same from here.
      if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
        throw notFound()
      }
      throw error
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? 'Deal' }, { name: 'robots', content: 'noindex' }],
  }),
  component: DealPage,
})

function DealPage() {
  const { dealId } = Route.useParams()
  return <Workspace key={dealId} dealId={dealId} />
}
