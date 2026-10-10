import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { session } from '../../../lib/session'
import { ClerkShell } from '../clerk'

const auth = { isLoaded: false, isSignedIn: undefined as boolean | undefined }

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
})
