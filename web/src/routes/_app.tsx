import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, type ReactNode } from 'react'

import { accountsEnabled } from '../features/auth/provider'
import { Sidebar } from '../features/shell/nav'
import styles from '../features/shell/shell.module.css'
import { session } from '../lib/session'

export const Route = createFileRoute('/_app')({ component: AppLayout })

const Signed = lazy(() => import('../features/auth/clerk').then((m) => ({ default: m.Signed })))

function Gate({ children }: { children: ReactNode }) {
  if (session.demo()) return children
  if (!accountsEnabled) return <Navigate to="/" />
  return (
    <Suspense fallback={null}>
      <Signed otherwise={<Navigate to="/sign-in" />}>{children}</Signed>
    </Suspense>
  )
}

function AppLayout() {
  return (
    <Gate>
      <div className={styles.app}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.page}>
            <Outlet />
          </div>
        </main>
      </div>
    </Gate>
  )
}
