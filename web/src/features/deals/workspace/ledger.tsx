import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'

import type { Analysis, Period } from '../../../lib/api/queries'
import { moneySigned } from '../../../lib/format'
import { Card } from '../../../ui/card'
import { Segmented } from '../../../ui/segmented'
import styles from './ledger.module.css'

const COLUMNS: { label: string; pick: (p: Period) => number; sum?: boolean }[] = [
  { label: 'Rent', pick: (p) => p.gross_rent + p.other_income },
  { label: 'Empty', pick: (p) => -p.vacancy },
  { label: 'Costs', pick: (p) => -p.opex },
  { label: 'Reserves', pick: (p) => -p.capex },
  { label: 'Loan', pick: (p) => -(p.interest + p.principal) },
  { label: 'Cash flow', pick: (p) => p.cash_flow, sum: true },
  { label: 'Running total', pick: (p) => p.cumulative_cash_flow, sum: true },
  { label: 'Your equity', pick: (p) => p.equity },
]

function Cell({ value, sum }: { value: number; sum?: boolean }) {
  const cls = [styles.cell, value < -0.5 && styles.neg, sum && styles.sum].filter(Boolean).join(' ')
  return (
    <div className={cls} role="cell">
      {Math.abs(value) < 0.5 ? '' : moneySigned(value)}
    </div>
  )
}

/** Every period of the ledger, virtualized so forty years of months stays smooth. */
export function Ledger({ analysis }: { analysis: Analysis }) {
  const [unit, setUnit] = useState<'years' | 'months'>('years')
  const rows = unit === 'months' ? (analysis.months ?? analysis.years) : analysis.years
  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 35,
    overscan: 8,
  })
  const name = (p: Period) =>
    p.period === 0 ? 'Closing' : unit === 'months' ? `Month ${p.period}` : `Year ${p.period}`
  return (
    <Card>
      <div className={styles.head}>
        <p>
          Where every dollar goes, {unit === 'years' ? 'year by year' : 'month by month'}. Money
          going out is negative.
        </p>
        <Segmented
          options={[
            { value: 'years', label: 'Years' },
            { value: 'months', label: 'Months' },
          ]}
          value={unit}
          onChange={setUnit}
          label="Ledger detail"
        />
      </div>
      <div className={styles.scroll} ref={scrollRef} role="table" aria-label="Ledger">
        <div className={styles.table} role="row">
          <div className={`${styles.cell} ${styles.th}`} role="columnheader" />
          {COLUMNS.map((c) => (
            <div key={c.label} className={`${styles.cell} ${styles.th}`} role="columnheader">
              {c.label}
            </div>
          ))}
        </div>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null
            return (
              <div
                key={item.key}
                className={styles.table}
                role="row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <div className={styles.cell} role="rowheader">
                  {name(row)}
                </div>
                {COLUMNS.map((c) => (
                  <Cell key={c.label} value={c.pick(row)} sum={c.sum} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
