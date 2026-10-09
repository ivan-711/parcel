import { SignOutButton, useUser } from '@clerk/react'
import { Link, useNavigate } from '@tanstack/react-router'

import { accountsEnabled } from '../auth/provider'
import { session } from '../../lib/session'
import styles from './shell.module.css'

function Account() {
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

function DemoBadge() {
  const navigate = useNavigate()
  const leave = () => {
    session.endDemo()
    void navigate({ to: '/' })
  }
  return (
    <>
      <span className={styles.demoPill}>Demo</span>
      <button type="button" onClick={leave} style={{ color: 'var(--accent)' }}>
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
      <Link to="/portfolio">Portfolio</Link>
      <Link to="/compare" className={styles.hideMobile}>
        Compare
      </Link>
      <div className={styles.right}>{demo || !accountsEnabled ? <DemoBadge /> : <Account />}</div>
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
