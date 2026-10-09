import { ClerkProvider, useAuth } from '@clerk/react'
import { useEffect, type ReactNode } from 'react'

import { session } from '../../lib/session'

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/** True when a Clerk instance is configured; otherwise the app is demo only. */
export const accountsEnabled = Boolean(key)

function Bridge({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth()
  useEffect(() => {
    session.useClerk(isSignedIn ? () => getToken() : null)
    return () => session.useClerk(null)
  }, [getToken, isSignedIn])
  return children
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!key) return children
  return (
    <ClerkProvider publishableKey={key} afterSignOutUrl="/">
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  )
}
