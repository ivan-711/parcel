import { lazy, Suspense, type ReactNode } from 'react'

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/** True when a Clerk instance is configured; otherwise the app is demo only. */
export const accountsEnabled = Boolean(key)

// Clerk is a large dependency, so it only loads when accounts are turned on.
const Clerk = lazy(() => import('./clerk').then((m) => ({ default: m.ClerkShell })))

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!key) return children
  return (
    <Suspense fallback={null}>
      <Clerk publishableKey={key}>{children}</Clerk>
    </Suspense>
  )
}
