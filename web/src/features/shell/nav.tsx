import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Columns2, Home, KanbanSquare, LayoutList, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { accountsEnabled } from '../auth/provider'
import { dealsQuery } from '../../lib/api/queries'
import { session } from '../../lib/session'
import { theme } from '../../lib/theme'
import styles from './shell.module.css'

const Account = lazy(() => import('../auth/clerk').then((m) => ({ default: m.Account })))

function Mark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      >
        <path d="M4 9l8-5 8 5v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M9 20v-6h6v6" />
      </svg>
    </span>
  )
}

function Recent() {
  const { data } = useQuery({ ...dealsQuery, staleTime: 30_000 })
  if (!data?.length) return null
  return (
    <div className={styles.recent}>
      <div className={styles.section}>Recent</div>
      {data.slice(0, 5).map((deal) => (
        <Link
          key={deal.id}
          to="/deals/$dealId"
          params={{ dealId: deal.id }}
          className={styles.item}
          title={deal.name}
        >
          <span>{deal.name}</span>
        </Link>
      ))}
    </div>
  )
}

function ThemeToggle() {
  const [current, setCurrent] = useState(theme.current)
  const flip = () => {
    const next = current === 'dark' ? 'light' : 'dark'
    theme.set(next)
    setCurrent(next)
  }
  return (
    <button type="button" className={styles.item} onClick={flip}>
      {current === 'dark' ? (
        <Sun size={15} strokeWidth={1.8} />
      ) : (
        <Moon size={15} strokeWidth={1.8} />
      )}
      <span>{current === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}

export function Sidebar() {
  const navigate = useNavigate()
  const demo = session.demo() !== null
  const leave = () => {
    session.endDemo()
    void navigate({ to: '/' })
  }
  return (
    <nav className={styles.rail} aria-label="Main">
      <Link to="/deals" className={styles.brand}>
        <Mark />
        Parcel
        {demo && <span className={styles.demo}>Demo</span>}
      </Link>
      <Link to="/deals" className={styles.item} activeOptions={{ exact: false }}>
        <LayoutList size={15} strokeWidth={1.8} />
        <span>Deals</span>
      </Link>
      <Link to="/pipeline" className={styles.item}>
        <KanbanSquare size={15} strokeWidth={1.8} />
        <span>Pipeline</span>
      </Link>
      <Link to="/portfolio" className={styles.item}>
        <Home size={15} strokeWidth={1.8} />
        <span>Portfolio</span>
      </Link>
      <Link to="/compare" className={styles.item}>
        <Columns2 size={15} strokeWidth={1.8} />
        <span>Compare</span>
      </Link>
      <Recent />
      <div className={styles.spacer} />
      {!demo && accountsEnabled && (
        <Suspense fallback={null}>
          <Account />
        </Suspense>
      )}
      <ThemeToggle />
      <Link to="/settings" className={styles.item}>
        <Settings size={15} strokeWidth={1.8} />
        <span>Settings</span>
      </Link>
      {demo && (
        <button type="button" className={styles.item} onClick={leave}>
          <LogOut size={15} strokeWidth={1.8} />
          <span>Leave the demo</span>
        </button>
      )}
    </nav>
  )
}

export function PublicNav() {
  return (
    <nav className={styles.top} aria-label="Main">
      <Link to="/" className={styles.brand}>
        <Mark />
        Parcel
      </Link>
      <a href="/#how" className={styles.hideMobile}>
        How it works
      </a>
      <a href="/#strategies" className={styles.hideMobile}>
        Strategies
      </a>
      <Link to="/methodology" className={styles.hideMobile}>
        Methodology
      </Link>
      <div className={styles.right}>
        {accountsEnabled ? (
          <Link to="/sign-in" style={{ color: 'var(--text)' }}>
            Sign in
          </Link>
        ) : (
          <Link to="/demo" style={{ color: 'var(--text)' }}>
            Open the demo
          </Link>
        )}
      </div>
    </nav>
  )
}
