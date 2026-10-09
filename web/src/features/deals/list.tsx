import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { dealsQuery, type Deal } from '../../lib/api/queries'
import { dateLong } from '../../lib/format'
import { STAGE_NAMES, STRATEGY_NAMES, oneLiner } from '../../lib/words'
import { LinkButton } from '../../ui/button'
import { Card } from '../../ui/card'
import { Warn } from '../../ui/check'
import styles from './list.module.css'

function where(deal: Deal): string {
  const a = deal.address
  if (!a) return 'No address'
  return [a.line1, a.city, a.state].filter(Boolean).join(', ')
}

function DealCard({ deal }: { deal: Deal }) {
  const s = deal.summary
  const bad =
    deal.strategy === 'wholesale' || deal.strategy === 'flip'
      ? s.total_profit <= 0
      : (s.monthly_cash_flow ?? 0) < 0
  return (
    <Link to="/deals/$dealId" params={{ dealId: deal.id }} className={styles.deal}>
      <Card as="article" padded={false} className={styles.deal}>
        <div className={styles.top}>
          <div>
            <h2>{deal.name}</h2>
            <p className={styles.where}>{where(deal)}</p>
          </div>
          <span className={styles.stage}>{STAGE_NAMES[deal.stage]}</span>
        </div>
        <p className={`${styles.line} ${bad ? styles.bad : ''}`}>{oneLiner(deal.inputs, s)}</p>
        <div className={styles.meta}>
          <span>{STRATEGY_NAMES[deal.strategy]}</span>
          {s.flags > 0 && (
            <span className={styles.flags}>
              <Warn />
              {s.flags} {s.flags === 1 ? 'thing' : 'things'} to watch
            </span>
          )}
          <span className={styles.spacer}>{dateLong(deal.updated_at)}</span>
        </div>
      </Card>
    </Link>
  )
}

export function DealList({ q }: { q: string }) {
  const { data: deals } = useSuspenseQuery(dealsQuery)
  const navigate = useNavigate()
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? deals.filter((d) => `${d.name} ${where(d)}`.toLowerCase().includes(needle))
    : deals
  return (
    <>
      <header className={styles.head}>
        <div>
          <h1>Deals</h1>
          <p>
            {deals.length} {deals.length === 1 ? 'property' : 'properties'} you're looking at.
          </p>
        </div>
        <div className={styles.actions}>
          <label className={styles.search}>
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by name or address"
              aria-label="Search deals"
              value={q}
              onChange={(e) =>
                void navigate({
                  to: '/deals',
                  search: { q: e.target.value || undefined },
                  replace: true,
                })
              }
            />
          </label>
          <LinkButton to="/deals/new" look="primary">
            New deal
          </LinkButton>
        </div>
      </header>
      {shown.length === 0 ? (
        <p className={styles.empty}>
          {deals.length === 0 ? 'No deals yet. Start with an address.' : 'Nothing matches that.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {shown.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </>
  )
}
