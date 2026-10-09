import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api, unwrap } from '../../../lib/api/client'
import {
  sensitivityQuery,
  simulateQuery,
  type HoldingInputs,
  type Metric,
  type SolveField,
} from '../../../lib/api/queries'
import { fieldsFor, type Field } from '../../../lib/fields'
import { money, moneySigned, multiple, percent } from '../../../lib/format'
import { Button } from '../../../ui/button'
import { Card, CardTitle } from '../../../ui/card'
import styles from './whatif.module.css'

interface MetricSpec {
  value: Metric
  label: string
  show: (v: number) => string
  parse: (t: string) => number
}

const IRR: MetricSpec = {
  value: 'irr',
  label: 'a year on my money',
  show: (v) => percent(v),
  parse: (t) => Number(t) / 100,
}

const METRICS: MetricSpec[] = [
  IRR,
  { value: 'cash_flow', label: 'a year in my pocket', show: (v) => moneySigned(v), parse: Number },
  { value: 'dscr', label: 'times the loan covered', show: (v) => multiple(v, 2), parse: Number },
  { value: 'total_profit', label: 'of profit', show: (v) => moneySigned(v), parse: Number },
]

const SOLVE_FIELDS: SolveField[] = [
  'price',
  'operations.monthly_rent',
  'rehab_cost',
  'after_repair_value',
  'down_payment_rate',
  'interest_rate',
  'refi_ltv',
  'cash_to_seller',
  'operations.vacancy_rate',
]

function showField(field: Field, value: number): string {
  switch (field.kind) {
    case 'rate':
      return percent(value, 2)
    case 'monthly':
      return `${money(value)} a month`
    default:
      return money(value)
  }
}

function Solve({ inputs }: { inputs: HoldingInputs }) {
  const fields = fieldsFor(inputs.strategy).filter((f) =>
    (SOLVE_FIELDS as string[]).includes(f.path),
  )
  const [field, setField] = useState<SolveField>('price')
  const [metric, setMetric] = useState<Metric>('irr')
  const [target, setTarget] = useState('12')
  const spec = METRICS.find((m) => m.value === metric) ?? IRR
  const solve = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/analyze/solve', {
          body: { inputs, field, metric, target: spec.parse(target) },
        }),
      ),
  })
  const chosen = fields.find((f) => f.path === field) ?? fields[0]
  return (
    <Card className={styles.wide}>
      <CardTitle sub="Work backwards from the return you want.">What would it take?</CardTitle>
      <form
        className={styles.solve}
        onSubmit={(e) => {
          e.preventDefault()
          solve.mutate()
        }}
      >
        <span>To get</span>
        <input
          className={styles.number}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Target"
          inputMode="decimal"
        />
        <select
          className={styles.select}
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          aria-label="Which result"
        >
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span>, what does</span>
        <select
          className={styles.select}
          value={field}
          onChange={(e) => setField(e.target.value as SolveField)}
          aria-label="Which input"
        >
          {fields.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label.toLowerCase()}
            </option>
          ))}
        </select>
        <span>need to be?</span>
        <Button type="submit" size="small" disabled={solve.isPending}>
          Work it out
        </Button>
      </form>
      {solve.data && chosen && (
        <p className={styles.result} aria-live="polite">
          {solve.data.value === null ? (
            <>No value of {chosen.label.toLowerCase()} gets there.</>
          ) : (
            <>
              {chosen.label} would need to be <em>{showField(chosen, solve.data.value)}</em>.
            </>
          )}
        </p>
      )}
      {solve.isError && (
        <p className={styles.muted}>Couldn&rsquo;t work that out. Try a different target.</p>
      )}
    </Card>
  )
}

function Tornado({ inputs }: { inputs: HoldingInputs }) {
  const { data, isPending } = useQuery(sensitivityQuery(inputs, 'irr'))
  const labels = Object.fromEntries(fieldsFor(inputs.strategy).map((f) => [f.path, f.label]))
  if (isPending || data?.base == null) {
    return (
      <Card>
        <CardTitle>What moves the return most</CardTitle>
        <p className={styles.muted}>
          {isPending ? 'Working it out' : 'Not available for this deal.'}
        </p>
      </Card>
    )
  }
  const base = data.base
  const swings = [...data.swings]
    .map((s) => ({ ...s, lo: s.low_result ?? base, hi: s.high_result ?? base }))
    .sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo))
    .slice(0, 6)
  const extent = Math.max(
    ...swings.flatMap((s) => [Math.abs(s.lo - base), Math.abs(s.hi - base)]),
    0.001,
  )
  const pos = (v: number) => 50 + ((v - base) / extent) * 48
  return (
    <Card>
      <CardTitle sub={`Each input nudged down and up. Today's answer is ${percent(base)} a year.`}>
        What moves the return most
      </CardTitle>
      <div className={styles.swings}>
        {swings.map((s) => {
          const l = Math.min(pos(s.lo), pos(s.hi))
          const r = Math.max(pos(s.lo), pos(s.hi))
          return (
            <div key={s.field} className={styles.swing}>
              <span>{labels[s.field] ?? s.field}</span>
              <div className={styles.bar} title={`${percent(s.lo)} to ${percent(s.hi)}`}>
                <i
                  className={styles.low}
                  style={{ left: `${Math.min(l, 50)}%`, width: `${Math.abs(50 - l)}%` }}
                />
                <i
                  className={styles.high}
                  style={{ left: `${Math.min(r, 50)}%`, width: `${Math.abs(r - 50)}%` }}
                />
                <span className={styles.base} style={{ left: '50%' }} />
                <small style={{ left: `${Math.min(l, r) - 1}%`, transform: 'translateX(-100%)' }}>
                  {percent(Math.min(s.lo, s.hi))}
                </small>
                <small style={{ left: `${Math.max(l, r) + 1}%` }}>
                  {percent(Math.max(s.lo, s.hi))}
                </small>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Grid({ inputs }: { inputs: HoldingInputs }) {
  const { data } = useQuery(sensitivityQuery(inputs, 'irr'))
  const labels = Object.fromEntries(fieldsFor(inputs.strategy).map((f) => [f.path, f.label]))
  if (!data) return null
  const g = data.grid
  const all = g.values.flat().filter((v): v is number => v !== null)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const mid = Math.floor(g.row_values.length / 2)
  const midCol = Math.floor(g.col_values.length / 2)
  const tone = (v: number | null) => (v === null ? 0 : hi === lo ? 0.5 : (v - lo) / (hi - lo))
  const fmt = (field: string, v: number) => (field.endsWith('rate') ? percent(v) : money(v))
  return (
    <Card>
      <CardTitle
        sub={`${labels[g.row_field] ?? g.row_field} down the side, ${(labels[g.col_field] ?? g.col_field).toLowerCase()} across. Return a year on your money.`}
      >
        Two things at once
      </CardTitle>
      <div className={styles.scroller}>
        <div
          className={styles.matrix}
          style={{ gridTemplateColumns: `auto repeat(${g.col_values.length}, 1fr)` }}
        >
          <div />
          {g.col_values.map((c) => (
            <div key={c} className={`${styles.c} ${styles.h}`}>
              {fmt(g.col_field, c)}
            </div>
          ))}
          {g.row_values.map((r, i) => (
            <div key={r} style={{ display: 'contents' }}>
              <div className={`${styles.c} ${styles.h}`} style={{ textAlign: 'right' }}>
                {fmt(g.row_field, r)}
              </div>
              {g.col_values.map((c, j) => {
                const v = g.values[i]?.[j] ?? null
                return (
                  <div
                    key={c}
                    className={`${styles.c} ${i === mid && j === midCol ? styles.base : ''}`}
                    style={{
                      background: `color-mix(in srgb, var(--accent) ${Math.round(6 + tone(v) * 34)}%, var(--card))`,
                    }}
                  >
                    {v === null ? '' : percent(v, 0)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function MonteCarlo({ inputs }: { inputs: HoldingInputs }) {
  const [armed, setArmed] = useState(false)
  const { data, isFetching, error } = useQuery({ ...simulateQuery(inputs), enabled: armed })
  const p = data?.irr_percentiles
  return (
    <Card className={styles.wide}>
      <CardTitle sub="Rent, empty months, repair overruns and the sale price all vary at once, ten thousand times.">
        How often does it go wrong?
      </CardTitle>
      {!data && (
        <p className={styles.muted}>
          <Button size="small" onClick={() => setArmed(true)} disabled={isFetching}>
            {isFetching ? 'Running' : 'Run 10,000 versions'}
          </Button>
          {error ? '  This needs Pro, or the demo.' : ''}
        </p>
      )}
      {data && p && (
        <>
          <div className={styles.mc}>
            <div>
              <b style={{ color: data.probability_of_loss > 0.2 ? 'var(--risk)' : undefined }}>
                {percent(data.probability_of_loss, 0)}
              </b>
              <span>of runs lose money</span>
            </div>
            <div>
              <b>{p['10'] == null ? 'n/a' : percent(p['10'])}</b>
              <span>a bad year (worst 10%)</span>
            </div>
            <div>
              <b>{p['50'] == null ? 'n/a' : percent(p['50'])}</b>
              <span>a typical year</span>
            </div>
            <div>
              <b>{p['90'] == null ? 'n/a' : percent(p['90'])}</b>
              <span>a good year (best 10%)</span>
            </div>
          </div>
          <div className={styles.hist} aria-hidden="true">
            {data.irr_histogram.counts.map((n, i) => {
              const max = Math.max(...data.irr_histogram.counts, 1)
              const edge = data.irr_histogram.edges[i] ?? 0
              return (
                <i
                  key={i}
                  className={edge < 0 ? styles.loss : ''}
                  style={{ height: `${(n / max) * 100}%` }}
                />
              )
            })}
          </div>
          <div className={styles.axis}>
            <span>{percent(data.irr_histogram.edges[0] ?? 0, 0)}</span>
            <span>return a year</span>
            <span>
              {percent(data.irr_histogram.edges[data.irr_histogram.edges.length - 1] ?? 0, 0)}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}

export function WhatIf({ inputs }: { inputs: HoldingInputs }) {
  return (
    <div className={styles.grid}>
      <Solve inputs={inputs} />
      <Tornado inputs={inputs} />
      <Grid inputs={inputs} />
      <MonteCarlo inputs={inputs} />
    </div>
  )
}
