import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { dealsQuery, type Deal } from '../../lib/api/queries'
import { dateLong } from '../../lib/format'
import { STAGE_NAMES, STRATEGY_NAMES, oneLiner } from '../../lib/words'
import { LinkButton } from '../../ui/button'
import { Card } from '../../ui/card'
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
        <h2>{deal.name}</h2>
        <p className={styles.where}>{where(deal)}</p>
        <p className={`${styles.line} ${bad ? styles.bad : ''}`}>{oneLiner(deal.inputs, s)}</p>
        <div className={styles.meta}>
          <span className={styles.chip}>{STRATEGY_NAMES[deal.strategy]}</span>
          <span className={styles.chip}>{STAGE_NAMES[deal.stage]}</span>
          {s.flags > 0 && (
            <span className={styles.flags}>
              {s.flags} {s.flags === 1 ? 'thing' : 'things'} to watch
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>{dateLong(deal.updated_at)}</span>
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
          <input
            type="search"
            className={styles.search}
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
