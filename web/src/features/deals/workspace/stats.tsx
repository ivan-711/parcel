import type { Stat } from '../../../lib/stats'
import { Card } from '../../../ui/card'
import { Chevron } from '../../../ui/check'
import styles from './workspace.module.css'

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
    <Card className={styles.stats} padded={false} as="div">
      {stats.map((stat) => (
        <button
          key={stat.key}
          type="button"
          id={`stat-${stat.key}`}
          className={`${styles.stat} ${stat.bad ? styles.bad : ''}`}
          aria-expanded={picked === stat.key}
          aria-controls="explain"
          onClick={() => onPick(picked === stat.key ? null : stat.key)}
        >
          <b>{stat.value}</b>
          <span>
            {stat.label}
            <Chevron />
          </span>
        </button>
      ))}
    </Card>
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
    <Card className={styles.why} padded={false} id="explain">
      <h2>{stat.title}</h2>
      <p>{stat.explain}</p>
      <div className={styles.deps} id="depends">
        <small>Depends on</small>
        {stat.depends.map((path) => (
          <button
            key={path}
            type="button"
            id={`dep-${path.replace(/\./g, '-')}`}
            className={styles.chip}
            onClick={() => onJump(path)}
          >
            {labelFor(path, labels)}
          </button>
        ))}
      </div>
    </Card>
  )
}
