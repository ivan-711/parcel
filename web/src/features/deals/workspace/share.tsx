import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { api, unwrap } from '../../../lib/api/client'
import { Button } from '../../../ui/button'
import { Card } from '../../../ui/card'
import styles from './share.module.css'

export function ShareButton({ dealId, shared }: { dealId: string; shared: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const share = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/deals/{deal_id}/share', { params: { path: { deal_id: dealId } } }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['deals', dealId] }),
  })
  const stop = useMutation({
    mutationFn: async () => {
      const result = await api.DELETE('/v1/deals/{deal_id}/share', {
        params: { path: { deal_id: dealId } },
      })
      // A 204 has no data for unwrap to return, so only a failed status goes through it.
      if (!result.response.ok) unwrap(result)
    },
    onSuccess: () => {
      share.reset()
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['deals', dealId] })
    },
  })

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const url = share.data ? `${window.location.origin}/r/${share.data.token}` : null
  const copy = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div className={styles.box} ref={box}>
      <Button
        onClick={() => {
          setOpen((o) => !o)
          if (!share.data) share.mutate()
        }}
        aria-expanded={open}
      >
        {shared ? 'Shared' : 'Share'}
      </Button>
      {open && (
        <Card className={styles.pop}>
          <p>
            Anyone with this link can read the deal, no account needed. It stays current as you
            edit.
          </p>
          {url && (
            <div className={styles.link}>
              <input
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(e) => e.target.select()}
              />
              <Button size="small" look="primary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          <div className={styles.row}>
            <a href={url ?? '#'} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
              Open it ›
            </a>
            <button
              type="button"
              className={styles.stop}
              onClick={() => stop.mutate()}
              style={{ marginLeft: 'auto' }}
            >
              Stop sharing
            </button>
          </div>
          {stop.isError && (
            <span role="alert" className={styles.error}>
              Couldn&rsquo;t stop sharing. Try again.
            </span>
          )}
        </Card>
      )}
    </div>
  )
}
