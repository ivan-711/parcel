import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'

import { api, ApiError, unwrap } from '../../lib/api/client'
import {
  meQuery,
  type Inputs,
  type LookupResult,
  type Provenance,
  type Strategy,
} from '../../lib/api/queries'
import { fieldsFor, type Field } from '../../lib/fields'
import { money, percent } from '../../lib/format'
import { getPath, setPath } from '../../lib/paths'
import { STRATEGIES, blank, infoFor, suggestionKey, type Draft } from '../../lib/strategies'
import { Button } from '../../ui/button'
import { Card } from '../../ui/card'
import styles from './new.module.css'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function AddressSearch({ onPick }: { onPick: (address: string) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const q = useDebounced(text.trim(), 200)
  const places = useQuery({
    queryKey: ['autocomplete', q],
    queryFn: async () =>
      unwrap(await api.GET('/v1/lookup/autocomplete', { params: { query: { q } } })),
    enabled: q.length >= 3,
    staleTime: 60_000,
  })
  const id = useId()
  const pick = (address: string) => {
    setText(address)
    setOpen(false)
    onPick(address)
  }
  return (
    <div className={styles.search}>
      <input
        id={id}
        className={styles.input}
        placeholder="Street address, city, state"
        aria-label="Property address"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim().length >= 5) pick(text.trim())
        }}
      />
      {open && places.data && places.data.length > 0 && (
        <ul className={styles.menu} role="listbox" aria-label="Matching addresses">
          {places.data.map((place) => (
            <li key={place.label} role="option" aria-selected={false}>
              <button type="button" onClick={() => pick(place.label)}>
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Facts({ result }: { result: LookupResult }) {
  const f = result.facts
  const items: [string, string | null][] = [
    ['Type', f.property_type],
    ['Beds', f.bedrooms === null ? null : String(f.bedrooms)],
    ['Baths', f.bathrooms === null ? null : String(f.bathrooms)],
    ['Size', f.square_feet === null ? null : `${Math.round(f.square_feet).toLocaleString()} sq ft`],
    ['Built', f.year_built === null ? null : String(f.year_built)],
    ['Last sold', f.last_sale_price === null ? null : money(f.last_sale_price)],
  ]
  return (
    <>
      <div className={styles.facts}>
        {items
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k}>
              {k} <b>{v}</b>
            </span>
          ))}
      </div>
      {result.notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
    </>
  )
}

function NumberField({
  field,
  value,
  from,
  onChange,
}: {
  field: Field
  value: number | null
  from: string | null
  onChange: (value: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const raw =
    value === null
      ? ''
      : field.kind === 'rate'
        ? String(Number((value * 100).toFixed(4)))
        : String(value)
  const shown = value !== null && field.kind !== 'rate' ? value.toLocaleString('en-US') : raw
  const id = useId()
  const unit =
    field.kind === 'rate'
      ? ' (%)'
      : field.kind === 'monthly'
        ? ' a month'
        : field.kind === 'months'
          ? ' (months)'
          : ''
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        <span>
          {field.label}
          {unit}
        </span>
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={draft ?? shown}
        placeholder={field.kind === 'money' || field.kind === 'monthly' ? '$' : ''}
        aria-describedby={`${id}-help`}
        onFocus={() => setDraft(raw)}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value.replace(/[^0-9.]/g, ''))
          onChange(
            e.target.value.trim() === '' || !Number.isFinite(n)
              ? null
              : field.kind === 'rate'
                ? n / 100
                : n,
          )
        }}
      />
      <small id={`${id}-help`} className={from ? styles.from : undefined}>
        {from ?? field.help}
      </small>
    </div>
  )
}

/** What was typed for a field, or null when nothing usable has been. */
function entered(inputs: Draft, field: Field): number | null {
  const own = getPath(inputs, field.path)
  return typeof own === 'number' && own >= (field.min ?? 0) ? own : null
}

export function NewDeal() {
  const navigate = useNavigate()
  const [address, setAddress] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<Strategy>('buy_and_hold')
  const [inputs, setInputs] = useState<Draft>(() => blank('buy_and_hold'))
  const [provenance, setProvenance] = useState<Provenance>({})
  const [name, setName] = useState('')
  const [manual, setManual] = useState(false)
  const { data: me } = useQuery(meQuery)

  const lookup = useMutation({
    mutationFn: async (text: string) =>
      unwrap(await api.POST('/v1/lookup', { body: { address: text } })),
    onSuccess: (result) => {
      setName((n) => (n === '' ? result.address.line1 : n))
    },
  })
  const result = lookup.data

  const info = infoFor(strategy)

  const choose = (next: Strategy) => {
    setStrategy(next)
    setInputs(blank(next))
  }

  const suggested = (path: string) => result?.suggestions[suggestionKey(path)] ?? null
  const valueFor = (field: Field): number | null =>
    entered(inputs, field) ?? suggested(field.path)?.value ?? null
  const fromFor = (field: Field): string | null => {
    if (entered(inputs, field) !== null) return null
    const s = suggested(field.path)
    if (!s) return null
    const range =
      s.low != null && s.high != null
        ? `, ${field.kind === 'rate' ? percent(s.low) : money(s.low)} to ${field.kind === 'rate' ? percent(s.high) : money(s.high)}`
        : ''
    return `${s.source.label}${range}`
  }

  const missing = info.required.filter((f) => valueFor(f) === null)
  const ready = missing.length === 0 && name.trim().length > 0

  const create = useMutation({
    mutationFn: async () => {
      let body = inputs
      const prov: Provenance = { ...provenance }
      for (const field of info.required) {
        const s = suggested(field.path)
        if (entered(body, field) === null && s) {
          body = setPath(body, field.path, s.value)
          prov[field.path] = {
            kind: s.source.kind,
            label: s.source.label,
            as_of: s.source.as_of ?? null,
          }
        }
      }
      // The user's own starting assumptions, for fields they didn't set here.
      const known = new Set(fieldsFor(strategy).map((f) => f.path))
      for (const [key, v] of Object.entries(me?.defaults ?? {})) {
        if (known.has(key) && typeof v === 'number' && !info.required.some((f) => f.path === key)) {
          body = setPath(body, key, v)
          prov[key] = { kind: 'user', label: 'Your usual number', as_of: null }
        }
      }
      const rate = result?.suggestions.interest_rate
      if (rate && (strategy === 'buy_and_hold' || strategy === 'brrrr')) {
        const key = strategy === 'brrrr' ? 'refi_rate' : 'interest_rate'
        body = setPath(body, key, rate.value)
        prov[key] = {
          kind: rate.source.kind,
          label: rate.source.label,
          as_of: rate.source.as_of ?? null,
        }
      }
      const addr = result?.address
      return unwrap(
        await api.POST('/v1/deals', {
          body: {
            name: name.trim(),
            // The button only enables once every required number is set.
            inputs: body as Inputs,
            address: addr
              ? {
                  line1: addr.line1,
                  city: addr.city,
                  state: addr.state,
                  zip: addr.zip,
                  county: addr.county,
                  latitude: addr.latitude,
                  longitude: addr.longitude,
                }
              : null,
            provenance: prov,
            stage: 'analyzing',
          },
        }),
      )
    },
    onSuccess: (deal) => void navigate({ to: '/deals/$dealId', params: { dealId: deal.id } }),
  })

  const lookupError =
    lookup.error instanceof ApiError
      ? lookup.error.message
      : lookup.isError
        ? 'The lookup failed.'
        : null

  return (
    <div className={styles.wrap}>
      <h1>New deal</h1>
      <p className={styles.lead}>
        Start with an address and Parcel fills in what it can, with the source of each number.
      </p>

      <section className={styles.step}>
        <h2>Where is it?</h2>
        <AddressSearch
          onPick={(text) => {
            setAddress(text)
            lookup.mutate(text)
          }}
        />
        {lookup.isPending && <p className={styles.note}>Looking it up</p>}
        {lookupError && (
          <p className={styles.note}>
            {lookupError} You can still enter the numbers yourself below.
          </p>
        )}
        {result && (
          <Card style={{ marginTop: 12 }}>
            <b>
              {[result.address.line1, result.address.city, result.address.state]
                .filter(Boolean)
                .join(', ')}
            </b>
            <Facts result={result} />
          </Card>
        )}
        {!result && !manual && (
          <p className={styles.skip}>
            <button
              type="button"
              onClick={() => setManual(true)}
              style={{ color: 'var(--accent)' }}
            >
              Skip the lookup and type the numbers in
            </button>
          </p>
        )}
      </section>

      {(result !== undefined || manual || address !== null) && (
        <>
          <section className={styles.step}>
            <h2>What would you do with it?</h2>
            <div className={styles.strategies} role="radiogroup" aria-label="Strategy">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={s.value === strategy}
                  className={styles.strategy}
                  onClick={() => choose(s.value)}
                >
                  <b>{s.name}</b>
                  <span>{s.line}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.step}>
            <h2>The numbers it needs</h2>
            <div className={styles.fields}>
              {info.required.map((field) => (
                <NumberField
                  key={`${strategy}-${field.path}`}
                  field={field}
                  value={valueFor(field)}
                  from={fromFor(field)}
                  onChange={(v) => {
                    setInputs((cur) => setPath(cur, field.path, v))
                    setProvenance((cur) => ({
                      ...cur,
                      [field.path]: { kind: 'user', label: 'Your number', as_of: null },
                    }))
                  }}
                />
              ))}
            </div>
            <div className={`${styles.field} ${styles.name}`}>
              <label htmlFor="deal-name">
                <span>Call it</span>
              </label>
              <input
                id="deal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Duplex on Main St"
              />
            </div>
            <div className={styles.go}>
              <Button
                look="primary"
                size="large"
                disabled={!ready || create.isPending}
                onClick={() => create.mutate()}
              >
                See if it works
              </Button>
              {!ready && missing.length > 0 && (
                <span className={styles.note}>
                  Still need {missing.map((f) => f.label.toLowerCase()).join(', ')}.
                </span>
              )}
              {create.isError && (
                <span className={styles.error}>Couldn&rsquo;t save the deal. Try again.</span>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
