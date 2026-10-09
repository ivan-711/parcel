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
import { Segmented } from '../../../ui/segmented'
import { Trace } from '../../../ui/trace'
import { Inspector } from './inspector'
import { Ledger } from './ledger'
import { Memo } from './memo'
import { Overview } from './overview'
import { WhatIf } from './whatif'
import { Explain, StatTiles } from './stats'
import { ShareButton } from './share'
import { VerdictCard } from './verdict'
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

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1101px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)')
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
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
  const wide = useWide()

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
  const links = useMemo(
    () =>
      (stat?.depends ?? []).map((p) => ({
        from: `dep-${p.replace(/\./g, '-')}`,
        to: `in-${p.replace(/\./g, '-')}`,
      })),
    [stat],
  )
  const words = verdict(inputs, analysis)
  const hold = ledgerOf(analysis)

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
    <div className={styles.layout} ref={layoutRef}>
      <div>
        <Link to="/deals" className={styles.crumb}>
          ‹ Deals
        </Link>
        <header className={styles.title}>
          <div>
            <h1>{deal.name}</h1>
            <p>
              {STRATEGY_NAMES[deal.strategy]} · {STAGE_NAMES[deal.stage]}
              {address ? ` · ${address}` : ''}
            </p>
          </div>
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
              Write the memo
            </Button>
          </div>
        </header>

        <VerdictCard verdict={words} />
        <StatTiles stats={stats} picked={picked} onPick={setPicked} />
        {stat && <Explain stat={stat} labels={labels} />}

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
        <h2>Your assumptions</h2>
        <p>Change any of these and the answer updates.</p>
        <Inspector
          strategy={inputs.strategy}
          inputs={inputs}
          provenance={provenance}
          lit={lit}
          onChange={edit}
        />
        <p className={styles.saving} aria-live="polite">
          {save.isPending
            ? 'Saving'
            : save.isError
              ? "Couldn't save your change."
              : dirty && live.isFetching
                ? 'Updating'
                : ''}
        </p>
      </aside>
      {wide && stat && <Trace container={layoutRef} links={links} gutter="inspector" />}
    </div>
  )
}
