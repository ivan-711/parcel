import { ClerkProvider, SignOutButton, useAuth, useUser } from '@clerk/react'
import { Link } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'

import { session } from '../../lib/session'
import styles from '../shell/shell.module.css'

/**
 * Hands Clerk's token getter to the session. It happens during render on
 * purpose: queries start during render too, so a child rendered in the same
 * pass as a sign in would reach the API before an effect could run.
 */
function Bridge({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth()
  session.useClerk(isSignedIn ? () => getToken() : null)
  useEffect(() => () => session.useClerk(null), [])
  return children
}

export function ClerkShell({
  publishableKey,
  children,
}: {
  publishableKey: string
  children: ReactNode
}) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  )
}

/** The signed in corner of the nav: settings and a sign out button. */
export function Account() {
  const { user } = useUser()
  const initial = user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress[0] ?? '?'
  return (
    <>
      <Link to="/settings">Settings</Link>
      <SignOutButton>
        <button type="button" className={styles.avatar} aria-label="Sign out">
          {initial.toUpperCase()}
        </button>
      </SignOutButton>
    </>
  )
}

/** Waits for Clerk, then sends anyone not signed in to the sign in page. */
export function Signed({ children, otherwise }: { children: ReactNode; otherwise: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return null
  if (!isSignedIn) return otherwise
  return children
}
