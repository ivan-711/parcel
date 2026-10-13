import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type DragEvent } from 'react'

import { api, unwrap } from '../../lib/api/client'
import { dealsQuery, type Deal, type Stage } from '../../lib/api/queries'
import { STAGE_NAMES, STRATEGY_NAMES, oneLiner } from '../../lib/words'
import { Card } from '../../ui/card'
import styles from './pipeline.module.css'

const STAGES: Stage[] = ['lead', 'analyzing', 'offer', 'under_contract', 'owned', 'passed']

function DealCard({ deal, onMove }: { deal: Deal; onMove: (stage: Stage) => void }) {
  return (
    <Card
      as="article"
      padded={false}
      className={styles.card}
      draggable
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <Link to="/deals/$dealId" params={{ dealId: deal.id }} style={{ color: 'inherit' }}>
        <h3>{deal.name}</h3>
        <p>{STRATEGY_NAMES[deal.strategy]}</p>
        <p className={styles.line}>{oneLiner(deal.inputs, deal.summary)}</p>
      </Link>
      <select
        className={styles.move}
        aria-label={`Move ${deal.name}`}
        value={deal.stage}
        onChange={(e) => onMove(e.target.value as Stage)}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s === deal.stage
              ? `In ${STAGE_NAMES[s].toLowerCase()}`
              : `Move to ${STAGE_NAMES[s].toLowerCase()}`}
          </option>
        ))}
      </select>
    </Card>
  )
}

export function Pipeline() {
  const queryClient = useQueryClient()
  const { data: deals } = useSuspenseQuery(dealsQuery)
  const [over, setOver] = useState<Stage | null>(null)

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) =>
      unwrap(
        await api.PUT('/v1/deals/{deal_id}/stage', {
          params: { path: { deal_id: id } },
          body: { stage, position: 0 },
        }),
      ),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] })
      const previous = queryClient.getQueryData(dealsQuery.queryKey)
      queryClient.setQueryData(dealsQuery.queryKey, (old) =>
        old?.map((d) => (d.id === id ? { ...d, stage, position: -1 } : d)),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(dealsQuery.queryKey, context.previous)
    },
    // A move into or out of Owned changes what the portfolio counts.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] })
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })

  const drop = (stage: Stage) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain')
    const deal = deals.find((d) => d.id === id)
    if (deal && deal.stage !== stage) move.mutate({ id, stage })
  }

  return (
    <>
      <header className={styles.head}>
        <h1>Pipeline</h1>
        <p>Drag a deal between columns, or use the menu on each card.</p>
      </header>
      <div className={styles.board}>
        {STAGES.map((stage) => {
          const here = deals
            .filter((d) => d.stage === stage)
            .sort((a, b) => a.position - b.position)
          return (
            <section
              key={stage}
              className={`${styles.column} ${over === stage ? styles.over : ''}`}
              aria-label={STAGE_NAMES[stage]}
              onDragOver={(e) => {
                e.preventDefault()
                if (over !== stage) setOver(stage)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={drop(stage)}
            >
              <h2>
                {STAGE_NAMES[stage]} <span>{here.length}</span>
              </h2>
              {here.length === 0 && <p className={styles.empty}>Nothing here</p>}
              {here.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onMove={(to) => move.mutate({ id: deal.id, stage: to })}
                />
              ))}
            </section>
          )
        })}
      </div>
    </>
  )
}
