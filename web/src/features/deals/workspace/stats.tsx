import type { Stat } from '../../../lib/stats'
import { Card } from '../../../ui/card'
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
    <div className={styles.stats}>
      {stats.map((stat) => (
        <button
          key={stat.key}
          type="button"
          className={`${styles.stat} ${stat.bad ? styles.bad : ''}`}
          aria-expanded={picked === stat.key}
          aria-controls="explain"
          onClick={() => onPick(picked === stat.key ? null : stat.key)}
        >
          <b>{stat.value}</b>
          <span>{stat.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Explain({ stat, labels }: { stat: Stat; labels: Record<string, string> }) {
  return (
    <Card className={styles.why} padded={false} id="explain">
      <div>
        <h2>{stat.title}</h2>
        <p>{stat.explain}</p>
      </div>
      <div className={styles.deps}>
        <small>Depends on</small>
        {stat.depends.map((path) => (
          <span key={path} id={`dep-${path.replace(/\./g, '-')}`} className={styles.chip}>
            {labelFor(path, labels)}
          </span>
        ))}
      </div>
    </Card>
  )
}
