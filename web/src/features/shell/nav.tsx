import { Link, useNavigate } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { accountsEnabled } from '../auth/provider'
import { session } from '../../lib/session'
import styles from './shell.module.css'

const Account = lazy(() => import('../auth/clerk').then((m) => ({ default: m.Account })))

function DemoBadge() {
  const navigate = useNavigate()
  const leave = () => {
    session.endDemo()
    void navigate({ to: '/' })
  }
  return (
    <>
      <span className={styles.demoPill}>Demo</span>
      <button type="button" onClick={leave}>
        Leave
      </button>
    </>
  )
}

export function AppNav() {
  const demo = session.demo() !== null
  return (
    <nav className={styles.nav} aria-label="Main">
      <Link to="/deals" className={styles.logo}>
        Parcel
      </Link>
      <Link to="/deals">Deals</Link>
      <Link to="/pipeline">Pipeline</Link>
      <Link to="/portfolio" className={styles.hideNarrow}>
        Portfolio
      </Link>
      <Link to="/compare" className={styles.hideMobile}>
        Compare
      </Link>
      <div className={styles.right}>
        {demo || !accountsEnabled ? (
          <DemoBadge />
        ) : (
          <Suspense fallback={null}>
            <Account />
          </Suspense>
        )}
      </div>
    </nav>
  )
}

export function PublicNav() {
  return (
    <nav className={`${styles.nav} ${styles.centered}`} aria-label="Main">
      <Link to="/" className={styles.logo}>
        Parcel
      </Link>
      <a href="#how" className={styles.hideMobile}>
        How it works
      </a>
      <a href="#strategies" className={styles.hideMobile}>
        Strategies
      </a>
      <Link to="/methodology" className={styles.hideMobile}>
        Methodology
      </Link>
      {accountsEnabled ? (
        <Link to="/sign-in" style={{ color: 'var(--text)' }}>
          Sign in
        </Link>
      ) : (
        <Link to="/demo" style={{ color: 'var(--text)' }}>
          Demo
        </Link>
      )}
    </nav>
  )
}
