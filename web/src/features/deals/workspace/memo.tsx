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

export interface MemoWriter {
  phase: Phase
  draft: string
  error: string | null
  start: () => void
}

/**
 * Writes the memo and follows it as it streams in. It belongs to the page
 * rather than the tab, so switching views mid-write neither restarts it nor
 * throws it away.
 */
export function useMemoWriter(dealId: string): MemoWriter {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const start = async () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPhase('writing')
    setDraft('')
    setError(null)
    let ended = false
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
            ended = true
            break
          case 'error':
            setError(event.title)
            ended = true
        }
      }
      // A connection can drop mid stream, in which case nothing says the memo is finished.
      if (!ended && !controller.signal.aborted) {
        setError('The memo was cut off before it finished. Try again.')
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      if (abort.current === controller) setPhase('idle')
    }
  }

  return { phase, draft, error, start: () => void start() }
}

const OUTLINE: [string, string][] = [
  ['Summary', 'The property, the plan and the answer in a paragraph.'],
  ['Returns', 'What you put in, what comes back, and when.'],
  ['Financing', 'The loan, its payment and how well the rent covers it.'],
  ['Risks', 'Every flag on this page, in plain words.'],
  ['Bottom line', 'Whether to proceed, and at what price.'],
]

export function Memo({ dealId, writer }: { dealId: string; writer: MemoWriter }) {
  const { data: memo, isPending } = useQuery(memoQuery(dealId))
  const { phase, draft, error, start } = writer

  const writing = phase !== 'idle'
  return (
    <Card className={styles.memo} padded={false}>
      <div className={styles.top}>
        <p>
          {memo
            ? `Written ${dateLong(memo.created_at)}${memo.stale ? ', before your latest changes' : ''}.`
            : 'A one page summary a lender would recognize, written from the figures on this page and checked against them before you see it.'}
        </p>
        <Button onClick={start} disabled={writing}>
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
        <ul className={styles.outline} aria-label="What the memo will cover">
          {OUTLINE.map(([title, line]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
