import {
  Banknote,
  ChevronRight,
  Clock,
  Handshake,
  Landmark,
  PiggyBank,
  Scale,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { ComponentType } from 'react'

import type { Stat } from '../../../lib/stats'
import styles from './workspace.module.css'

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  cash_flow: Wallet,
  irr: TrendingUp,
  cash_to_close: Banknote,
  dscr: Scale,
  refi_cash_out: PiggyBank,
  cash_left_in_deal: Landmark,
  total_profit: Banknote,
  roi: TrendingUp,
  horizon: Clock,
  assignment_fee: Handshake,
  buyer_max_price: Scale,
  seventy: Landmark,
  earnest: ShieldAlert,
}

export function labelFor(path: string, labels: Record<string, string>): string {
  return labels[path] ?? path
}

export function StatTiles({
  stats,
  picked,
  onPick,
}: {
  stats: Stat[]
  picked: string | null
  onPick: (key: string | null) => void
}) {
  return (
    <div className={styles.stats}>
      {stats.map((stat) => {
        const Icon = ICONS[stat.key] ?? Banknote
        return (
          <button
            key={stat.key}
            type="button"
            id={`stat-${stat.key}`}
            className={`${styles.stat} ${stat.bad ? styles.bad : ''}`}
            aria-expanded={picked === stat.key}
            aria-controls="explain"
            onClick={() => onPick(picked === stat.key ? null : stat.key)}
          >
            <div className={styles.l}>
              <i className={styles.icon}>
                <Icon size={12} strokeWidth={2.2} />
              </i>
              {stat.name}
              <ChevronRight
                size={12}
                strokeWidth={2.2}
                aria-hidden="true"
                className={styles.hint}
              />
            </div>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Explain({
  stat,
  labels,
  onJump,
}: {
  stat: Stat
  labels: Record<string, string>
  onJump: (path: string) => void
}) {
  return (
    <div className={styles.why} id="explain">
      <h2>{stat.title}</h2>
      <p>{stat.explain}</p>
      <div className={styles.deps} id="depends">
        <small>Depends on</small>
        {stat.depends.map((path) => (
          <button
            key={path}
            type="button"
            id={`dep-${path.replace(/\./g, '-')}`}
            className={styles.dep}
            onClick={() => onJump(path)}
          >
            {labelFor(path, labels)}
          </button>
        ))}
      </div>
    </div>
  )
}
