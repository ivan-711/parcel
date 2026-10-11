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
type Recorded = NonNullable<Property['months'][number]['actual']>

/** What someone types for a dollar amount, commas and all. */
function amount(text: string): number {
  return Number(text.replace(/[,$\s]/g, '')) || 0
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

export function Entry({
  dealId,
  month,
  recorded,
  onDone,
}: {
  dealId: string
  month: string
  recorded: Recorded | null
  onDone: () => void
}) {
  const was = (value: number | undefined) => (value ? String(value) : '')
  const [rent, setRent] = useState(was(recorded?.rent_collected))
  const [costs, setCosts] = useState(was(recorded?.operating_expenses))
  const [loan, setLoan] = useState(was(recorded?.debt_service))
  const [capital, setCapital] = useState(was(recorded?.capital_spent))
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/deals/{deal_id}/actuals/{month}', {
          params: { path: { deal_id: dealId, month } },
          body: {
            rent_collected: amount(rent),
            operating_expenses: amount(costs),
            debt_service: amount(loan),
            capital_spent: amount(capital),
            note: recorded?.note ?? '',
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

function BoughtOn({ dealId, value }: { dealId: string; value: string | null }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (acquired_on: string) =>
      unwrap(
        await api.PATCH('/v1/deals/{deal_id}', {
          params: { path: { deal_id: dealId } },
          body: { acquired_on },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      void queryClient.invalidateQueries({ queryKey: ['deals'] })
    },
  })
  return (
    <label className={styles.bought}>
      Bought on
      <input
        type="date"
        value={value ?? ''}
        max={new Date().toLocaleDateString('en-CA')}
        onChange={(e) => e.target.value && save.mutate(e.target.value)}
      />
    </label>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const [editing, setEditing] = useState<string | null>(null)
  const { deal } = property
  const diff = property.variance_to_date
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
        <BoughtOn dealId={deal.id} value={deal.acquired_on} />
        {property.months.some((m) => m.actual_cash_flow !== null) && (
          <p className={styles.vs}>
            Running <b className={diff < 0 ? styles.bad : ''}>{moneySigned(diff)}</b>{' '}
            {diff < 0 ? 'behind' : 'ahead of'} plan
          </p>
        )}
      </header>
      {property.months.length === 0 ? (
        <p className={styles.empty} style={{ marginTop: 8, fontSize: 13 }}>
          Nothing to record yet. The first month shows up once it's over, or set an earlier purchase
          date above.
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
              <span className={styles.n}>
                {m.actual_cash_flow === null ? '' : moneySigned(m.actual_cash_flow)}
              </span>
              {editing === m.month ? (
                <Entry
                  dealId={deal.id}
                  month={m.month}
                  recorded={m.actual}
                  onDone={() => setEditing(null)}
                />
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
                  <em className={(data.variance_rate ?? 0) < -0.05 ? styles.bad : ''}>
                    {moneySigned(Math.abs(data.variance_to_date))}{' '}
                    {data.variance_to_date < 0 ? 'behind' : 'ahead'}
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
