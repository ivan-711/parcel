import { describe, expect, it } from 'vitest'

import { statsFor } from '../stats'
import { analysis, duplex } from './fixtures'

describe('stats', () => {
  const stats = statsFor(duplex, analysis)

  it('leads a rental with four plain numbers', () => {
    expect(stats.map((s) => [s.value, s.label])).toEqual([
      ['$308', 'a month in your pocket'],
      ['15.5%', 'a year on your money'],
      ['$61,040', 'cash to close'],
      ['1.4x', 'rent covers the loan'],
    ])
  })

  it('explains the return with the figures it came from', () => {
    const irr = stats.find((s) => s.key === 'irr')
    expect(irr?.title).toBe('Where 15.5% a year comes from')
    expect(irr?.explain).toContain('You put in $61,040')
    expect(irr?.explain).toContain('$135,928 of it when you sell')
    expect(irr?.explain).toContain('3.2x your money')
    expect(irr?.depends).toEqual([
      'price',
      'operations.monthly_rent',
      'interest_rate',
      'appreciation',
      'hold_years',
    ])
  })

  it('names every input a number depends on', () => {
    for (const stat of stats) expect(stat.depends.length).toBeGreaterThan(0)
  })
})
