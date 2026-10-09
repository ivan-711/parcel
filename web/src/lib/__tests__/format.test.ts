import { describe, expect, it } from 'vitest'

import { compact, date, dateLong, money, moneySigned, months, multiple, percent } from '../format'

describe('format', () => {
  it('writes money without cents by default', () => {
    expect(money(218_000)).toBe('$218,000')
    expect(money(1_234.56)).toBe('$1,235')
    expect(money(41.5, true)).toBe('$41.50')
  })

  it('shows a loss with a leading minus', () => {
    expect(moneySigned(-1_820)).toBe('-$1,820')
    expect(moneySigned(308)).toBe('$308')
  })

  it('rounds percentages to what people say', () => {
    expect(percent(0.15472)).toBe('15.5%')
    expect(percent(0.05)).toBe('5%')
    expect(percent(0.0675, 2)).toBe('6.75%')
    expect(percent(0.7903, 0)).toBe('79%')
  })

  it('writes multiples and durations', () => {
    expect(multiple(1.3954)).toBe('1.4x')
    expect(months(1)).toBe('1 month')
    expect(months(5)).toBe('5 months')
    expect(months(12)).toBe('1 year')
    expect(months(120)).toBe('10 years')
  })

  it('compacts axis labels', () => {
    expect(compact(135_845)).toBe('$136K')
    expect(compact(-61_040)).toBe('-$61K')
    expect(compact(1_250_000)).toBe('$1.3M')
    expect(compact(420)).toBe('$420')
  })

  it('keeps a calendar day on the day it says', () => {
    expect(dateLong('2026-10-08')).toBe('Oct 8, 2026')
    expect(date('2026-10-08')).toBe('Oct 8')
    expect(dateLong('2026-10-08T23:30:00Z')).toMatch(/Oct [89], 2026/)
  })
})
