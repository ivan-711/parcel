import { createFileRoute } from '@tanstack/react-router'

import { Workspace } from '../../features/deals/workspace/workspace'
import { dealQuery } from '../../lib/api/queries'

export const Route = createFileRoute('/_app/deals/$dealId')({
  loader: ({ context, params }) =>
    context.queryClient.query({ ...dealQuery(params.dealId), staleTime: 'static' }),
  component: DealPage,
})

function DealPage() {
  const { dealId } = Route.useParams()
  return <Workspace key={dealId} dealId={dealId} />
}
