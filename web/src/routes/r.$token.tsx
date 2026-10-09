import { createFileRoute } from '@tanstack/react-router'

import { Report } from '../features/report/report'
import { sharedQuery } from '../lib/api/queries'

export const Route = createFileRoute('/r/$token')({
  loader: ({ context, params }) =>
    context.queryClient.query({ ...sharedQuery(params.token), staleTime: 'static' }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.name}, a Parcel report` : 'Parcel report' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ReportPage,
})

function ReportPage() {
  const { token } = Route.useParams()
  return <Report token={token} />
}
