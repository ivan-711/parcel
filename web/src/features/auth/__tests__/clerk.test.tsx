import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { session } from '../../../lib/session'
import { ClerkShell } from '../clerk'

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: () => Promise.resolve('tok') }),
  useUser: () => ({ user: null }),
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ClerkShell', () => {
  it('has the token ready before anything under it renders', async () => {
    session.endDemo()
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
})
