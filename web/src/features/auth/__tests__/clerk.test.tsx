import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '../../../lib/api/query-client'
import { session } from '../../../lib/session'
import { ClerkShell } from '../clerk'

const auth = {
  isLoaded: false,
  isSignedIn: undefined as boolean | undefined,
  userId: null as string | null | undefined,
}

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ ...auth, getToken: () => Promise.resolve('tok') }),
  useUser: () => ({ user: null }),
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ClerkShell', () => {
  it('has the token ready before anything under it renders', async () => {
    session.endDemo()
    auth.isLoaded = true
    auth.isSignedIn = true
    let seen: Promise<string | null> | undefined
    function Page() {
      seen ??= session.token()
      return null
    }
    render(
      <ClerkShell publishableKey="pk_test_x">
        <Page />
      </ClerkShell>,
    )
    expect(await seen).toBe('tok')
  })

  it('keeps route guards waiting until Clerk has loaded', async () => {
    session.endDemo()
    auth.isLoaded = false
    auth.isSignedIn = undefined
    const view = render(<ClerkShell publishableKey="pk_test_x">{null}</ClerkShell>)
    let settled = false
    const ready = session.ready().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    auth.isLoaded = true
    auth.isSignedIn = true
    view.rerender(<ClerkShell publishableKey="pk_test_x">{null}</ClerkShell>)
    await ready
    expect(await session.token()).toBe('tok')
  })

  describe('who the cached data belongs to', () => {
    // A new element each time, or React skips the re-render.
    const shell = () => <ClerkShell publishableKey="pk_test_x">{null}</ClerkShell>

    beforeEach(() => {
      session.useClerk(null)
      session.endDemo()
      queryClient.clear()
    })

    it('drops it when a different user signs in', () => {
      auth.isLoaded = true
      auth.isSignedIn = true
      auth.userId = 'user_a'
      const view = render(shell())
      queryClient.setQueryData(['deals'], [{ id: 'belongs-to-a' }])
      auth.userId = 'user_b'
      view.rerender(shell())
      expect(queryClient.getQueryData(['deals'])).toBeUndefined()
    })

    it('drops it on sign out', () => {
      auth.isLoaded = true
      auth.isSignedIn = true
      auth.userId = 'user_a'
      const view = render(shell())
      queryClient.setQueryData(['me'], { id: 'user_a' })
      auth.isSignedIn = false
      auth.userId = null
      view.rerender(shell())
      expect(queryClient.getQueryData(['me'])).toBeUndefined()
    })

    it('keeps it across renders for the same user', () => {
      auth.isLoaded = true
      auth.isSignedIn = true
      auth.userId = 'user_a'
      const view = render(shell())
      queryClient.setQueryData(['me'], { id: 'user_a' })
      view.rerender(shell())
      expect(queryClient.getQueryData(['me'])).toEqual({ id: 'user_a' })
    })
  })
})
