import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { api, unwrap } from '../../lib/api/client'
import { portfolioQuery, type Portfolio as PortfolioData } from '../../lib/api/queries'
import { moneySigned } from '../../lib/format'
import { Button, LinkButton } from '../../ui/button'
import { Card } from '../../ui/card'
import styles from './portfolio.module.css'

type Property = PortfolioData['properties'][number]

/** Shortfall as a share of plan; a small miss is a fact, not a warning. */
function gap(data: PortfolioData): number {
  if (!data.projected_to_date) return 0
  return (data.actual_to_date - data.projected_to_date) / Math.abs(data.projected_to_date)
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

function Entry({ dealId, month, onDone }: { dealId: string; month: string; onDone: () => void }) {
  const [rent, setRent] = useState('')
  const [costs, setCosts] = useState('')
  const [loan, setLoan] = useState('')
  const [capital, setCapital] = useState('')
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/deals/{deal_id}/actuals/{month}', {
          params: { path: { deal_id: dealId, month } },
          body: {
            rent_collected: Number(rent) || 0,
            operating_expenses: Number(costs) || 0,
            debt_service: Number(loan) || 0,
            capital_spent: Number(capital) || 0,
          },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      onDone()
    },
  })
  return (
    <form
      className={styles.entry}
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <input
        placeholder="Rent in"
        aria-label="Rent collected"
        inputMode="decimal"
        value={rent}
        onChange={(e) => setRent(e.target.value)}
      />
      <input
        placeholder="Costs"
        aria-label="Operating costs"
        inputMode="decimal"
        value={costs}
        onChange={(e) => setCosts(e.target.value)}
      />
      <input
        placeholder="Loan"
        aria-label="Loan payment"
        inputMode="decimal"
        value={loan}
        onChange={(e) => setLoan(e.target.value)}
      />
      <input
        placeholder="Big items"
        aria-label="Capital spent"
        inputMode="decimal"
        value={capital}
        onChange={(e) => setCapital(e.target.value)}
      />
      <Button type="submit" size="small" look="primary" disabled={save.isPending}>
        Save
      </Button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const [editing, setEditing] = useState<string | null>(null)
  const { deal } = property
  const diff = property.actual_to_date - property.projected_to_date
  return (
    <Card className={styles.property} as="article">
      <header>
        <h2>
          <Link to="/deals/$dealId" params={{ dealId: deal.id }} style={{ color: 'inherit' }}>
            {deal.name}
          </Link>
        </h2>
        <p>
          {deal.address ? [deal.address.line1, deal.address.city].filter(Boolean).join(', ') : ''}
        </p>
        {property.months.some((m) => m.actual_cash_flow !== null) && (
          <p className={styles.vs}>
            Running <b className={diff < 0 ? styles.bad : ''}>{moneySigned(diff)}</b>{' '}
            {diff < 0 ? 'behind' : 'ahead of'} plan
          </p>
        )}
      </header>
      {property.months.length === 0 ? (
        <p className={styles.empty} style={{ marginTop: 8, fontSize: 13 }}>
          Nothing to record yet. Set the purchase date on the deal so months start counting.
        </p>
      ) : (
        <div className={styles.months}>
          <div className={styles.month}>
            <span>Month</span>
            <span className={styles.n}>Planned</span>
            <span className={styles.n}>Actual</span>
            <span />
          </div>
          {[...property.months].reverse().map((m) => (
            <div key={m.month} className={styles.month}>
              <span>{monthName(m.month)}</span>
              <span className={styles.n}>{moneySigned(m.projected_cash_flow)}</span>
              <span
                className={`${styles.n} ${m.actual_cash_flow === null ? '' : m.actual_cash_flow < m.projected_cash_flow ? styles.bad : styles.good}`}
              >
                {m.actual_cash_flow === null ? '' : moneySigned(m.actual_cash_flow)}
              </span>
              {editing === m.month ? (
                <Entry dealId={deal.id} month={m.month} onDone={() => setEditing(null)} />
              ) : (
                <button type="button" className={styles.add} onClick={() => setEditing(m.month)}>
                  {m.actual_cash_flow === null ? 'Record what happened' : 'Change'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function Portfolio() {
  const { data } = useSuspenseQuery(portfolioQuery)
  return (
    <>
      <header className={styles.head}>
        <h1>Portfolio</h1>
        <p>The properties you own, and how they're doing against the plan.</p>
      </header>
      {data.properties.length === 0 ? (
        <p className={styles.empty}>
          Nothing owned yet. Move a deal to Owned on the <Link to="/pipeline">pipeline</Link> and it
          shows up here.
        </p>
      ) : (
        <>
          <Card className={styles.summary} padded={false} aria-live="polite">
            <p className={styles.sentence}>
              <em>{moneySigned(data.monthly_projected_now)} a month</em> planned across everything
              you own.{' '}
              {data.projected_to_date !== 0 && (
                <>
                  So far <em>{moneySigned(data.actual_to_date)}</em> came in against{' '}
                  {moneySigned(data.projected_to_date)} planned,{' '}
                  <em className={gap(data) < -0.05 ? styles.bad : ''}>
                    {moneySigned(Math.abs(data.actual_to_date - data.projected_to_date))}{' '}
                    {data.actual_to_date < data.projected_to_date ? 'behind' : 'ahead'}
                  </em>
                  .
                </>
              )}
            </p>
          </Card>
          {data.properties.map((p) => (
            <PropertyCard key={p.deal.id} property={p} />
          ))}
        </>
      )}
      <p style={{ marginTop: 24 }}>
        <LinkButton to="/deals/new">New deal</LinkButton>
      </p>
    </>
  )
}
