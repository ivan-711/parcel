import { useSuspenseQuery } from '@tanstack/react-query'

import { ledgerOf, sharedQuery, type Provenance } from '../../lib/api/queries'
import { GROUPS } from '../../lib/fields'
import { dateLong, money, moneySigned, months, percent } from '../../lib/format'
import { getPath } from '../../lib/paths'
import { statsFor } from '../../lib/stats'
import { STRATEGY_NAMES, verdict } from '../../lib/words'
import { Button } from '../../ui/button'
import { Card } from '../../ui/card'
import { Check, Warn } from '../../ui/check'
import styles from './report.module.css'

function show(kind: string, value: unknown): string {
  if (value === null || value === undefined) return 'None'
  const n = Number(value)
  switch (kind) {
    case 'money':
      return money(n)
    case 'monthly':
      return `${money(n)} a month`
    case 'rate':
      return percent(n, 2)
    case 'months':
      return months(n)
    default:
      return n === 1 ? '1 year' : `${n} years`
  }
}

function source(path: string, provenance: Provenance, fallback: string | undefined): string {
  const s = provenance[path]
  if (!s) return fallback ?? ''
  return s.as_of ? `${s.label}, ${dateLong(s.as_of)}` : s.label
}

/** A shared deal, readable without an account and clean when printed. */
export function Report({ token }: { token: string }) {
  const { data: deal } = useSuspenseQuery(sharedQuery(token))
  const words = verdict(deal.inputs, deal.analysis)
  const stats = statsFor(deal.inputs, deal.analysis)
  const ledger = ledgerOf(deal.analysis)
  const address = deal.address
    ? [deal.address.line1, deal.address.city, deal.address.state].filter(Boolean).join(', ')
    : ''
  const fields = GROUPS[deal.strategy].flatMap((g) => g.fields)
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1>{deal.name}</h1>
          <p>
            {STRATEGY_NAMES[deal.strategy]}
            {address ? ` · ${address}` : ''} · Updated {dateLong(deal.updated_at)}
          </p>
        </div>
        <span className={styles.brand}>Parcel</span>
      </header>

      <Card className={styles.verdict} padded={false}>
        <div className={`${styles.ok} ${words.answer !== 'yes' ? styles[words.answer] : ''}`}>
          {words.answer === 'yes' ? <Check /> : <Warn />} {words.headline}
        </div>
        <p className={styles.answer}>
          {words.parts.map((part, i) =>
            part.lit ? <em key={i}>{part.text}</em> : <span key={i}>{part.text}</span>,
          )}
        </p>
        {words.watch && (
          <p className={styles.watch}>
            <b>Watch out:</b> {words.watch}
          </p>
        )}
      </Card>

      <div className={styles.stats}>
        {stats.map((s) => (
          <Card key={s.key} className={`${styles.stat} ${s.bad ? styles.bad : ''}`} padded={false}>
            <b>{s.value}</b>
            <span>{s.label}</span>
          </Card>
        ))}
      </div>

      <section className={styles.section}>
        <h2>Assumptions and where they came from</h2>
        <div className={styles.assumptions}>
          {fields
            .filter((f) => {
              const v = getPath(deal.inputs, f.path)
              return v !== undefined && !(f.more && (v === null || v === 0))
            })
            .map((f) => (
              <div key={f.path} className={styles.row}>
                <span>
                  {f.label}
                  <small>{source(f.path, deal.provenance, f.help)}</small>
                </span>
                <b>{show(f.kind, getPath(deal.inputs, f.path))}</b>
              </div>
            ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Year by year</h2>
        <table className={styles.years}>
          <thead>
            <tr>
              <th />
              <th>Rent</th>
              <th>Costs</th>
              <th>Loan</th>
              <th>Cash flow</th>
              <th>Running total</th>
              <th>Equity</th>
            </tr>
          </thead>
          <tbody>
            {ledger.years.map((y) => (
              <tr key={y.period}>
                <td>{y.period === 0 ? 'Closing' : `Year ${y.period}`}</td>
                <td>{y.gross_rent ? money(y.gross_rent + y.other_income) : ''}</td>
                <td className={styles.neg}>
                  {y.opex + y.capex + y.vacancy ? moneySigned(-(y.opex + y.capex + y.vacancy)) : ''}
                </td>
                <td className={styles.neg}>
                  {y.interest + y.principal ? moneySigned(-(y.interest + y.principal)) : ''}
                </td>
                <td className={y.cash_flow < 0 ? styles.neg : ''}>{moneySigned(y.cash_flow)}</td>
                <td className={y.cumulative_cash_flow < 0 ? styles.neg : ''}>
                  {moneySigned(y.cumulative_cash_flow)}
                </td>
                <td>{money(y.equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className={styles.actions}>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <p className={styles.foot}>
        Figures come from Parcel&rsquo;s month by month model using the assumptions above. Market
        figures are estimates from the sources named next to them. This is a projection, not advice,
        and not a guarantee of any outcome.
      </p>
    </main>
  )
}
