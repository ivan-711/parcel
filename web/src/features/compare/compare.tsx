import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { compareQuery, dealsQuery, isWholesale, type DealDetail } from '../../lib/api/queries'
import { statsFor } from '../../lib/stats'
import { STRATEGY_NAMES, verdict } from '../../lib/words'
import { Card } from '../../ui/card'
import styles from './compare.module.css'

interface Row {
  label: string
  cells: { text: string; bad?: boolean; score?: number }[]
}

function rows(deals: DealDetail[]): Row[] {
  const stats = deals.map((d) => statsFor(d.inputs, d.analysis))
  const keys = new Map<string, string>()
  for (const list of stats) for (const s of list) if (!keys.has(s.key)) keys.set(s.key, s.label)
  const out: Row[] = [
    { label: 'Strategy', cells: deals.map((d) => ({ text: STRATEGY_NAMES[d.strategy] })) },
    {
      label: 'The answer',
      cells: deals.map((d) => {
        const v = verdict(d.inputs, d.analysis)
        return { text: v.headline, bad: v.answer === 'no' }
      }),
    },
  ]
  for (const [key, label] of keys) {
    out.push({
      label,
      cells: stats.map((list) => {
        const s = list.find((x) => x.key === key)
        return s ? { text: s.value, bad: s.bad } : { text: '' }
      }),
    })
  }
  out.push({
    label: 'Things to watch',
    cells: deals.map((d) => {
      const flags = isWholesale(d.analysis) ? d.analysis.flags : d.analysis.flags
      return {
        text: flags.length ? flags.map((f) => f.message).join(' ') : 'Nothing flagged',
        bad: flags.some((f) => f.severity === 'risk'),
      }
    }),
  })
  return out
}

export function Compare({ ids }: { ids: string[] }) {
  const navigate = useNavigate()
  const { data: deals } = useSuspenseQuery(dealsQuery)
  const picked = ids.filter((id) => deals.some((d) => d.id === id))
  const { data: details, isPending } = useQuery(compareQuery(picked.length >= 2 ? picked : []))

  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-4)
    void navigate({ to: '/compare', search: next.length ? { ids: next } : {}, replace: true })
  }

  return (
    <>
      <header className={styles.head}>
        <h1>Compare</h1>
        <p>Pick two to four deals and read them side by side.</p>
      </header>
      <div className={styles.picker} role="group" aria-label="Deals to compare">
        {deals.map((d) => (
          <button
            key={d.id}
            type="button"
            className={styles.pick}
            aria-pressed={picked.includes(d.id)}
            onClick={() => toggle(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>
      {picked.length < 2 ? (
        <p className={styles.hint}>Pick {picked.length === 1 ? 'one more' : 'at least two'}.</p>
      ) : isPending || !details ? (
        <p className={styles.hint}>Working it out</p>
      ) : (
        <Card
          className={styles.table}
          padded={false}
          style={{ '--n': details.length } as React.CSSProperties}
        >
          <div className={styles.row}>
            <div className={styles.cell} />
            {details.map((d) => (
              <div key={d.id} className={`${styles.cell} ${styles.th}`}>
                {d.name}
                <small>
                  {d.address ? [d.address.line1, d.address.city].filter(Boolean).join(', ') : ''}
                </small>
              </div>
            ))}
          </div>
          {rows(details).map((row) => (
            <div key={row.label} className={styles.row}>
              <div className={styles.cell}>{row.label}</div>
              {row.cells.map((cell, i) => (
                <div
                  key={i}
                  className={`${styles.cell} ${row.label.length < 20 && cell.text.length < 16 ? styles.big : ''} ${cell.bad ? styles.bad : ''}`}
                >
                  {cell.text}
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
