import { createFileRoute, redirect } from '@tanstack/react-router'

import { accountsEnabled } from '../features/auth/provider'
import { api, unwrap } from '../lib/api/client'
import { session } from '../lib/session'

let starting: Promise<void> | null = null

/** One sandbox per visit, even when the route is preloaded and loaded at once. */
async function startDemo() {
  starting ??= (async () => {
    const demo = unwrap(await api.POST('/v1/demo'))
    session.startDemo(demo.token, demo.expires_at)
  })().finally(() => {
    starting = null
  })
  await starting
}

/** Starts a private sandbox and drops the visitor into it. No account needed. */
export const Route = createFileRoute('/demo')({
  beforeLoad: async ({ preload }) => {
    if (preload) return
    if (accountsEnabled) {
      // Someone already signed in has no use for a sandbox. That is worth a moment's wait
      // for Clerk, not a long one: a sandbox is cheap, and a real session still wins later.
      await session.ready(2_000)
      if (await session.isActive()) throw redirect({ to: '/deals' })
    }
    if (!session.demo()) await startDemo()
    throw redirect({ to: '/deals' })
  },
})
