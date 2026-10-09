import { createFileRoute, redirect } from '@tanstack/react-router'

import { api, unwrap } from '../lib/api/client'
import { session } from '../lib/session'

/** Starts a private sandbox and drops the visitor into it. No account needed. */
export const Route = createFileRoute('/demo')({
  beforeLoad: async () => {
    if (!session.demo()) {
      const demo = unwrap(await api.POST('/v1/demo'))
      session.startDemo(demo.token, demo.expires_at)
    }
    throw redirect({ to: '/deals' })
  },
})
