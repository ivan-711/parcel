import { useId, type KeyboardEvent } from 'react'

import styles from './segmented.module.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  const id = useId()
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    document.getElementById(`${id}-${next.value}`)?.focus()
  }
  return (
    <div className={styles.group} role="tablist" aria-label={label} onKeyDown={onKey} tabIndex={-1}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${id}-${option.value}`}
          aria-selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          className={styles.item}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
