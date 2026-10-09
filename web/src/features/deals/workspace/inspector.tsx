import { useState } from 'react'

import type { Inputs, Provenance, Strategy } from '../../../lib/api/queries'
import { GROUPS, type Field, type Kind } from '../../../lib/fields'
import { dateLong, money, months, percent } from '../../../lib/format'
import { getPath } from '../../../lib/paths'
import styles from './inspector.module.css'

function show(kind: Kind, value: unknown): string {
  if (value === null || value === undefined) return 'None'
  const n = Number(value)
  switch (kind) {
    case 'money':
      return money(n)
    case 'monthly':
      return `${money(n)} a month`
    case 'rate':
      return percent(n, 2)
    case 'months':
      return months(n)
    case 'years':
      return n === 1 ? '1 year' : `${n} years`
  }
}

function raw(kind: Kind, value: unknown): string {
  if (value === null || value === undefined) return ''
  const n = Number(value)
  return kind === 'rate' ? String(Number((n * 100).toFixed(4))) : String(n)
}

function parse(kind: Kind, text: string, optional: boolean): number | null | undefined {
  const cleaned = text.replace(/[^0-9.-]/g, '')
  if (!cleaned) return optional ? null : undefined
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return undefined
  switch (kind) {
    case 'rate':
      return n / 100
    case 'months':
    case 'years':
      return Math.max(0, Math.round(n))
    default:
      return Math.max(0, n)
  }
}

function caption(field: Field, provenance: Provenance): string {
  const source = provenance[field.path]
  if (!source) return field.help ?? ''
  return source.as_of ? `${source.label}, ${dateLong(source.as_of)}` : source.label
}

function Row({
  field,
  value,
  lit,
  caption: text,
  onChange,
}: {
  field: Field
  value: unknown
  lit: boolean
  caption: string
  onChange: (value: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = `in-${field.path.replace(/\./g, '-')}`
  const commit = () => {
    if (draft === null) return
    const parsed = parse(field.kind, draft, Boolean(field.optional))
    setDraft(null)
    if (parsed !== undefined && parsed !== value) onChange(parsed)
  }
  return (
    <div className={`${styles.row} ${lit ? styles.lit : ''}`} id={id}>
      <label className={styles.label} htmlFor={`${id}-input`}>
        {field.label}
        <small>{text}</small>
      </label>
      <input
        id={`${id}-input`}
        className={styles.value}
        inputMode="decimal"
        value={draft ?? show(field.kind, value)}
        onFocus={(e) => {
          setDraft(raw(field.kind, value))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

export function Inspector({
  strategy,
  inputs,
  provenance,
  lit,
  onChange,
}: {
  strategy: Strategy
  inputs: Inputs
  provenance: Provenance
  lit: Set<string>
  onChange: (path: string, value: number | null) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <>
      {GROUPS[strategy].map((group) => {
        const folded = group.fields.filter((f) => f.more)
        const shown = open[group.title] ? group.fields : group.fields.filter((f) => !f.more)
        return (
          <section key={group.title} className={styles.group}>
            <h3>{group.title}</h3>
            <div className={styles.list}>
              {shown.map((field) => (
                <Row
                  key={field.path}
                  field={field}
                  value={getPath(inputs, field.path)}
                  lit={lit.has(field.path)}
                  caption={caption(field, provenance)}
                  onChange={(value) => onChange(field.path, value)}
                />
              ))}
              {folded.length > 0 && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => setOpen((o) => ({ ...o, [group.title]: !o[group.title] }))}
                >
                  {open[group.title] ? 'Show less' : `${folded.length} more`}
                </button>
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}
