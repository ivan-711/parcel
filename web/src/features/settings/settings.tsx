import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { api, unwrap } from '../../lib/api/client'
import { meQuery } from '../../lib/api/queries'
import { session } from '../../lib/session'
import { Button } from '../../ui/button'
import { Card } from '../../ui/card'
import styles from './settings.module.css'

interface Default {
  key: string
  label: string
  help: string
  /** Parcel's usual number, shown so a blank field says what it means. */
  usual: string
}

/** Rates a new deal starts from, as percentages in the form and decimals on the wire. */
const DEFAULTS: Default[] = [
  {
    key: 'interest_rate',
    label: 'Loan rate',
    help: 'Used when no market rate is available',
    usual: '7',
  },
  { key: 'down_payment_rate', label: 'Down payment', help: 'For rentals', usual: '25' },
  { key: 'closing_cost_rate', label: 'Closing costs', help: 'Share of price', usual: '3' },
  {
    key: 'operations.vacancy_rate',
    label: 'Empty',
    help: 'Share of the year with no tenant',
    usual: '5',
  },
  { key: 'operations.management_rate', label: 'Management', help: 'Share of rent', usual: '8' },
  { key: 'operations.maintenance_rate', label: 'Repairs', help: 'Share of rent', usual: '5' },
  { key: 'operations.capex_rate', label: 'Reserves', help: 'Share of rent', usual: '5' },
  { key: 'appreciation', label: 'Value growth', help: 'A year', usual: '3' },
  { key: 'operations.rent_growth', label: 'Rent growth', help: 'A year', usual: '3' },
]

/** A percentage as typed, sign or no sign: null when blank, undefined when it can't be read. */
function readPercent(text: string): number | null | undefined {
  const digits = text.replace(/[%,\s]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n / 100 : undefined
}

export function Settings() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useSuspenseQuery(meQuery)
  const [name, setName] = useState(me.name ?? '')
  const [defaults, setDefaults] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      DEFAULTS.map((d) => {
        const v = me.defaults[d.key]
        return [d.key, typeof v === 'number' ? String(Number((v * 100).toFixed(3))) : '']
      }),
    ),
  )

  const [problem, setProblem] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: async (clean: Record<string, number>) =>
      unwrap(await api.PATCH('/v1/me', { body: { name: name.trim(), defaults: clean } })),
    onSuccess: (data) => queryClient.setQueryData(meQuery.queryKey, data),
  })
  // The whole set goes up together, so a field that can't be read has to stop the save
  // rather than drop out of it and take its stored value with it.
  const submit = () => {
    const clean: Record<string, number> = {}
    for (const d of DEFAULTS) {
      const rate = readPercent(defaults[d.key] ?? '')
      if (rate === undefined) {
        setProblem(`Couldn't read the ${d.label.toLowerCase()}. Try a number like ${d.usual}.`)
        return
      }
      if (rate !== null) clean[d.key] = rate
    }
    setProblem(null)
    save.mutate(clean)
  }

  const checkout = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/billing/checkout')),
    onSuccess: (r) => window.location.assign(r.url),
  })
  const portal = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/billing/portal')),
    onSuccess: (r) => window.location.assign(r.url),
  })

  const [hoursLeft] = useState(() =>
    me.demo_expires_at
      ? Math.max(0, Math.round((new Date(me.demo_expires_at).getTime() - Date.now()) / 3_600_000))
      : null,
  )

  return (
    <div className={styles.wrap}>
      <h1>Settings</h1>
      <p className={styles.lead}>
        {me.is_demo ? 'A demo sandbox. Nothing here is saved past its expiry.' : me.email}
      </p>

      <section className={styles.section}>
        <h2>Your name</h2>
        <div className={styles.list}>
          <div className={styles.row}>
            <label htmlFor="name">Shown on shared reports</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: 220, textAlign: 'left' }}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Starting assumptions</h2>
        <p>New deals start from these. Leave one blank to use Parcel&rsquo;s usual number.</p>
        <div className={styles.list}>
          {DEFAULTS.map((d) => (
            <div key={d.key} className={styles.row}>
              <label htmlFor={`d-${d.key}`}>
                {d.label}
                <small>{d.help}</small>
              </label>
              <input
                id={`d-${d.key}`}
                inputMode="decimal"
                placeholder={`${d.usual}%`}
                value={defaults[d.key] ?? ''}
                onChange={(e) => setDefaults((cur) => ({ ...cur, [d.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <Button look="primary" onClick={submit} disabled={save.isPending}>
            Save
          </Button>
          <span className={styles.status} aria-live="polite">
            {problem ?? (save.isSuccess ? 'Saved.' : save.isError ? "Couldn't save." : '')}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Plan</h2>
        <Card className={styles.plan} padded={false}>
          {me.is_demo ? (
            <>
              <b>Demo</b>
              <p>
                Everything is unlocked for{' '}
                {hoursLeft === null ? 'a day' : `${hoursLeft} more hours`}. Create an account to
                keep your deals.
              </p>
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    session.endDemo()
                    void navigate({ to: '/' })
                  }}
                >
                  Leave the demo
                </Button>
              </div>
            </>
          ) : me.plan === 'pro' ? (
            <>
              <b>Pro</b>
              <p>Ten thousand run what-ifs and more memos a day.</p>
              <div className={styles.actions}>
                <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
                  Manage billing
                </Button>
              </div>
            </>
          ) : (
            <>
              <b>Free</b>
              <p>
                Pro adds the ten thousand run what-ifs and more memos a day. Billing runs in test
                mode, so no card is ever charged.
              </p>
              <div className={styles.actions}>
                <Button
                  look="primary"
                  onClick={() => checkout.mutate()}
                  disabled={checkout.isPending}
                >
                  Try Pro
                </Button>
                {checkout.isError && (
                  <span className={styles.status}>Billing isn&rsquo;t set up on this server.</span>
                )}
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  )
}
