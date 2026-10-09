import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { writeMemo } from '../../../lib/api/memo'
import { memoQuery, type MemoOut } from '../../../lib/api/queries'
import { dateLong } from '../../../lib/format'
import { Button } from '../../../ui/button'
import { Card } from '../../../ui/card'
import { Check, Warn } from '../../../ui/check'
import styles from './memo.module.css'

function Body({ text, live }: { text: string; live?: boolean }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  return (
    <div className={`${styles.body} ${live ? styles.cursor : ''}`}>
      {blocks.map((block, i) =>
        block.startsWith('## ') ? (
          <h3 key={i}>{block.slice(3)}</h3>
        ) : (
          <p key={i}>{block.replace(/^#+\s*/, '')}</p>
        ),
      )}
    </div>
  )
}

function Grounding({ memo, stale }: { memo: MemoOut; stale: boolean }) {
  if (!memo.grounded) {
    return (
      <p className={`${styles.note} ${styles.warn}`}>
        <Warn />
        <span>
          These figures don&rsquo;t match the engine and shouldn&rsquo;t be trusted:{' '}
          {memo.unmatched.join(', ')}. The rest were checked.
        </span>
      </p>
    )
  }
  return (
    <p className={`${styles.note} ${styles.good}`}>
      <Check />
      <span>
        Every figure in this memo was checked against the engine.
        {stale ? ' The deal has changed since it was written.' : ''}
      </span>
    </p>
  )
}

type Phase = 'idle' | 'writing' | 'retrying'

export function Memo({ dealId, request }: { dealId: string; request: number }) {
  const queryClient = useQueryClient()
  const { data: memo, isPending } = useQuery(memoQuery(dealId))
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const seen = useRef(0)

  const start = async () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPhase('writing')
    setDraft('')
    setError(null)
    try {
      for await (const event of writeMemo(dealId, controller.signal)) {
        switch (event.kind) {
          case 'draft':
            setPhase('writing')
            setDraft((d) => d + event.text)
            break
          case 'retry':
            setPhase('retrying')
            setDraft('')
            break
          case 'done':
            queryClient.setQueryData(memoQuery(dealId).queryKey, event.memo)
            setPhase('idle')
            break
          case 'error':
            setError(event.title)
            setPhase('idle')
        }
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      setPhase('idle')
    }
  }

  useEffect(() => {
    if (request > seen.current) {
      seen.current = request
      void start()
    }
    // start reads fresh state each time; only the request counter should trigger it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  useEffect(() => () => abort.current?.abort(), [])

  const writing = phase !== 'idle'
  return (
    <Card className={styles.memo}>
      <div className={styles.top}>
        <p>
          {memo
            ? `Written ${dateLong(memo.created_at)}${memo.stale ? ', before your latest changes' : ''}.`
            : 'A one page summary a lender would recognize, written from the numbers on this page.'}
        </p>
        <Button look={memo ? 'default' : 'primary'} onClick={() => void start()} disabled={writing}>
          {writing ? 'Writing' : memo ? 'Rewrite' : 'Write the memo'}
        </Button>
      </div>
      {error && (
        <p className={`${styles.note} ${styles.warn}`}>
          <Warn />
          <span>{error}</span>
        </p>
      )}
      {phase === 'retrying' && (
        <p className={styles.empty}>
          A figure didn&rsquo;t match the engine, so it&rsquo;s being rewritten.
        </p>
      )}
      {writing ? (
        <Body text={draft} live />
      ) : memo ? (
        <>
          <Grounding memo={memo} stale={memo.stale} />
          <Body text={memo.body} />
        </>
      ) : isPending ? null : (
        <p className={styles.empty}>No memo yet.</p>
      )}
    </Card>
  )
}
