import type { Analysis, Inputs } from '../../../lib/api/queries'
import { money, moneySigned, months } from '../../../lib/format'
import { useMedia } from '../../../lib/use-media'
import { MoneyLine, type ChartPoint } from '../../../ui/chart'
import { Card, CardTitle } from '../../../ui/card'
import styles from './overview.module.css'

const EVENT_WORDS: Record<Analysis['events'][number]['kind'], string> = {
  purchase: 'Buy',
  rehab_done: 'Repairs done',
  rent_starts: 'Rent starts',
  refinance: 'Refinance',
  balloon: 'Balloon due',
  sale: 'Sell',
}

function when(month: number): string {
  if (month === 0) return 'Closing'
  return month % 12 === 0 ? `Year ${month / 12}` : `Month ${month}`
}

function Timeline({ analysis }: { analysis: Analysis }) {
  return (
    <ol className={styles.timeline} aria-label="What happens when">
      {analysis.events.map((e, i) => (
        <li key={i} style={{ listStyle: 'none' }}>
          <b>
            {EVENT_WORDS[e.kind]}
            {e.amount != null && e.kind !== 'rehab_done'
              ? ` ${e.kind === 'refinance' ? 'with a' : 'for'} ${money(e.amount)}${e.kind === 'refinance' ? ' loan' : ''}`
              : ''}
          </b>
          {when(e.month)}
        </li>
      ))}
    </ol>
  )
}

function RentBreakdown({ inputs, analysis }: { inputs: Inputs; analysis: Analysis }) {
  const month = analysis.months?.[analysis.stabilized_month + 1]
  if (!month || month.gross_rent <= 0) return null
  const rows: [string, number, 'on' | 'bad' | ''][] = [
    [inputs.strategy === 'creative' ? 'Loan payments' : 'Mortgage', month.debt_service, ''],
    ['Taxes, insurance', month.fixed_costs, ''],
    ['Upkeep', month.other_opex, ''],
    ['Reserves', month.capex, ''],
    ['Empty months', month.vacancy, ''],
    ['Left over', month.cash_flow, month.cash_flow < 0 ? 'bad' : 'on'],
  ]
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)))
  rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return (
    <Card className={styles.panel} padded={false}>
      <CardTitle sub={`Each month, out of ${money(month.potential_income)}`}>
        Where the rent goes
      </CardTitle>
      <div className={styles.rows}>
        {rows.map(([label, value, tone]) => (
          <div key={label} className={`${styles.r} ${tone ? styles[tone] : ''}`}>
            <span>{label}</span>
            <i style={{ width: `${max ? (Math.abs(value) / max) * 100 : 0}%` }} />
            <b>{moneySigned(value)}</b>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function Overview({ inputs, analysis }: { inputs: Inputs; analysis: Analysis }) {
  const wide = useMedia('(min-width: 1101px)')
  const byMonth = analysis.horizon_months <= 36
  const rows = byMonth ? (analysis.months ?? analysis.years) : analysis.years
  const points: ChartPoint[] = rows.map((p) => ({
    x: p.period,
    label: p.period === 0 ? 'Now' : byMonth ? `Month ${p.period}` : `Year ${p.period}`,
    value: p.cumulative_cash_flow,
  }))
  const last = points[points.length - 1]
  const span = byMonth
    ? months(analysis.horizon_months)
    : `${Math.round(analysis.horizon_months / 12)} years`
  const ahead = last ? `${moneySigned(last.value)} ${last.value >= 0 ? 'ahead' : 'behind'}` : ''
  return (
    <div className={styles.panels}>
      <Card className={styles.panel} padded={false}>
        <CardTitle
          sub={`Everything in and out, added up. You sell ${byMonth ? `in ${span}` : `in year ${Math.round(analysis.horizon_months / 12)}`}.`}
        >
          Your money over {span}
        </CardTitle>
        <MoneyLine
          points={points}
          height={wide ? 230 : 190}
          startLabel={`${money(-(points[0]?.value ?? 0))} in`}
          endLabel={ahead}
        />
        <Timeline analysis={analysis} />
      </Card>
      {inputs.strategy !== 'flip' && <RentBreakdown inputs={inputs} analysis={analysis} />}
    </div>
  )
}
