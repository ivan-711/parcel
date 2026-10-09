const money0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function money(value: number, cents = false): string {
  return (cents ? money2 : money0).format(value)
}

/** Money with a sign only when negative, which is how people read a loss. */
export function moneySigned(value: number): string {
  return value < 0 ? `-${money0.format(-value)}` : money0.format(value)
}

export function percent(rate: number, digits = 1): string {
  const value = rate * 100
  const rounded = Number(value.toFixed(digits))
  return `${plain.format(rounded) === String(rounded) ? rounded : rounded}%`
}

export function multiple(value: number, digits = 1): string {
  return `${value.toFixed(digits)}x`
}

export function months(count: number): string {
  if (count % 12 === 0 && count >= 12) {
    const years = count / 12
    return years === 1 ? '1 year' : `${years} years`
  }
  return count === 1 ? '1 month' : `${count} months`
}

export function compact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}

/** A date only string is a calendar day, not midnight UTC, so it must not shift by timezone. */
function parse(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
}

export function date(iso: string): string {
  return parse(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function dateLong(iso: string): string {
  return parse(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
