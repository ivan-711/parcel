import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api, unwrap } from '../../../lib/api/client'
import {
  analysisQuery,
  dealQuery,
  ledgerOf,
  type AnyAnalysis,
  type Inputs,
  type Provenance,
} from '../../../lib/api/queries'
import { fieldsFor } from '../../../lib/fields'
import { setPath } from '../../../lib/paths'
import { statsFor } from '../../../lib/stats'
import { STAGE_NAMES, STRATEGY_NAMES, verdict } from '../../../lib/words'
import { Button, LinkButton } from '../../../ui/button'
import { Chevron } from '../../../ui/check'
import { Card } from '../../../ui/card'
import { useMedia } from '../../../lib/use-media'
import { Segmented } from '../../../ui/segmented'
import { Trace } from '../../../ui/trace'
import { Inspector } from './inspector'
import { Ledger } from './ledger'
import { Memo } from './memo'
import { Overview } from './overview'
import { WhatIf } from './whatif'
import { Explain, StatTiles } from './stats'
import { ShareButton } from './share'
import { VerdictBand } from './verdict'
import styles from './workspace.module.css'

type Tab = 'overview' | 'ledger' | 'whatif' | 'memo'

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'ledger', label: 'Year by year' },
  { value: 'whatif', label: 'What if' },
  { value: 'memo', label: 'Memo' },
]

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function Workspace({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient()
  const { data: deal } = useSuspenseQuery(dealQuery(dealId))
  const [inputs, setInputs] = useState<Inputs>(deal.inputs)
  const [provenance, setProvenance] = useState<Provenance>(deal.provenance)
  const [tab, setTab] = useState<Tab>('overview')
  const [picked, setPicked] = useState<string | null>(null)
  const [memoRequest, setMemoRequest] = useState(0)
  const layoutRef = useRef<HTMLDivElement>(null)
  const wide = useMedia('(min-width: 1101px)')

  const debounced = useDebounced(inputs, 250)
  const dirty = JSON.stringify(debounced) !== JSON.stringify(deal.inputs)
  const live = useQuery({ ...analysisQuery(debounced), enabled: dirty })
  const analysis: AnyAnalysis = dirty && live.data ? live.data : deal.analysis

  const save = useMutation({
    mutationFn: async (body: { inputs: Inputs; provenance: Provenance }) =>
      unwrap(
        await api.PATCH('/v1/deals/{deal_id}', { params: { path: { deal_id: dealId } }, body }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] })
    },
  })
  const { mutate } = save
  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(() => mutate({ inputs: debounced, provenance }), 700)
    return () => clearTimeout(id)
  }, [debounced, dirty, provenance, mutate])

  const labels = useMemo(
    () => Object.fromEntries(fieldsFor(inputs.strategy).map((f) => [f.path, f.label])),
    [inputs.strategy],
  )
  const stats = statsFor(inputs, analysis)
  const stat = stats.find((s) => s.key === picked) ?? null
  const lit = useMemo(() => new Set(stat?.depends ?? []), [stat])
  // One origin, the "Depends on" row, fanning out through the gutter to each input.
  const links = useMemo(
    () =>
      (stat?.depends ?? []).map((p) => ({
        from: 'depends',
        to: `in-${p.replace(/\./g, '-')}`,
      })),
    [stat],
  )
  const words = verdict(inputs, analysis)
  const hold = ledgerOf(analysis)

  // A chip scrolls to its row and flashes it; on a phone that is the whole trace.
  const jump = (path: string) => {
    const row = document.getElementById(`in-${path.replace(/\./g, '-')}`)
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.classList.add('flash')
    setTimeout(() => row.classList.remove('flash'), 1200)
  }

  const edit = (path: string, value: number | null) => {
    setInputs((cur) => setPath(cur, path, value))
    setProvenance((cur) => ({
      ...cur,
      [path]: { kind: 'user', label: 'Your number', as_of: null },
    }))
  }

  const address = deal.address
    ? [deal.address.city, deal.address.state].filter(Boolean).join(', ')
    : ''
  const tabs = inputs.strategy === 'wholesale' ? TABS.filter((t) => t.value !== 'whatif') : TABS

  return (
    <>
      <div className={styles.crumb}>
        <Link to="/deals">Deals</Link>
        <span>/</span>
        <b>{deal.name}</b>
      </div>
      <header className={styles.title}>
        <h1>{deal.name}</h1>
        <span className={styles.chip}>{STRATEGY_NAMES[deal.strategy]}</span>
        <span className={styles.chip}>{STAGE_NAMES[deal.stage]}</span>
        {deal.address?.line1 && (
          <span className={styles.addr}>
            {[deal.address.line1, address].filter(Boolean).join(', ')}
          </span>
        )}
        <div className={styles.actions}>
          <LinkButton to="/compare" search={{ ids: [deal.id] }}>
            Compare
          </LinkButton>
          <ShareButton dealId={deal.id} shared={deal.shared} />
          <Button
            look="primary"
            onClick={() => {
              setTab('memo')
              setMemoRequest((n) => n + 1)
            }}
          >
            Write memo
          </Button>
        </div>
      </header>

      <div className={styles.layout} ref={layoutRef}>
        <div>
          <Card className={styles.verdict} padded={false}>
            <VerdictBand verdict={words} />
            <StatTiles stats={stats} picked={picked} onPick={setPicked} />
            {stat && <Explain stat={stat} labels={labels} onJump={jump} />}
          </Card>

          {!wide && (
            <a href="#inspector" className={styles.toInspector}>
              Your assumptions <Chevron />
            </a>
          )}
          <div className={styles.tabs}>
            <Segmented options={tabs} value={tab} onChange={setTab} label="Deal views" />
          </div>
          <div className={styles.panel} role="tabpanel">
            {tab === 'overview' && <Overview inputs={inputs} analysis={hold} />}
            {tab === 'ledger' && <Ledger analysis={hold} />}
            {tab === 'whatif' && inputs.strategy !== 'wholesale' && <WhatIf inputs={inputs} />}
            {tab === 'memo' && <Memo dealId={dealId} request={memoRequest} />}
          </div>
        </div>

        <aside className={styles.side} id="inspector">
          <Card padded={false}>
            <div className={styles.sideHead}>
              <h2>Assumptions</h2>
              <span
                className={`${styles.saving} ${save.isError ? styles.failed : save.isPending || (dirty && live.isFetching) ? styles.busy : ''}`}
                aria-live="polite"
              >
                {save.isPending
                  ? 'Saving'
                  : save.isError
                    ? "Couldn't save"
                    : dirty && live.isFetching
                      ? 'Updating'
                      : 'Saved'}
              </span>
            </div>
            <Inspector
              strategy={inputs.strategy}
              inputs={inputs}
              provenance={provenance}
              lit={lit}
              onChange={edit}
            />
          </Card>
        </aside>
        {wide && stat && <Trace container={layoutRef} links={links} gutter="inspector" />}
      </div>
    </>
  )
}
