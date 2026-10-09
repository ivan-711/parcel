import { useAuth } from '@clerk/react'
import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { accountsEnabled } from '../features/auth/provider'
import { AppNav } from '../features/shell/nav'
import styles from '../features/shell/shell.module.css'
import { session } from '../lib/session'

export const Route = createFileRoute('/_app')({ component: AppLayout })

function Signed({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return null
  if (!isSignedIn) return <Navigate to="/sign-in" />
  return children
}

function Gate({ children }: { children: ReactNode }) {
  if (session.demo()) return children
  if (!accountsEnabled) return <Navigate to="/" />
  return <Signed>{children}</Signed>
}

function AppLayout() {
  return (
    <Gate>
      <AppNav />
      <main className={styles.page}>
        <Outlet />
      </main>
    </Gate>
  )
}
