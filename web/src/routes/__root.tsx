import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, createRootRouteWithContext } from '@tanstack/react-router'

import { NotFound } from '../features/shell/not-found'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { title: 'Parcel' },
      {
        name: 'description',
        content:
          'Know if a property makes money. Parcel turns an address into a plain answer and shows where every number came from.',
      },
    ],
  }),
  component: Root,
  notFoundComponent: NotFound,
})

function Root() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  )
}
