import { describe, expect, it } from 'vitest'

import type { Analysis, Inputs } from '../api/queries'
import { oneLiner, verdict } from '../words'
import { analysis, duplex, metrics } from './fixtures'

const text = (a: Analysis) =>
  verdict(duplex, a)
    .parts.map((p) => p.text)
    .join('')

describe('verdict', () => {
  it('says yes to a deal that pays every month and grows', () => {
    const v = verdict(duplex, analysis)
    expect(v.answer).toBe('yes')
    expect(v.headline).toBe('Yes, it works')
    expect(text(analysis)).toBe('$308 a month in your pocket, and your money grows 15.5% a year.')
    expect(v.parts.filter((p) => p.lit).map((p) => p.text)).toEqual([
      '$308 a month',
      '15.5% a year',
    ])
    expect(v.watch).toBeNull()
  })

  it('warns when the deal is only barely rented enough', () => {
    const tight: Analysis = { ...analysis, metrics: { ...metrics, break_even_occupancy: 0.91 } }
    expect(verdict(duplex, tight).watch).toBe(
      'it needs to be rented 91% of the time to cover its costs.',
    )
  })

  it('leads with the worst flag', () => {
    const flagged: Analysis = {
      ...analysis,
      flags: [
        { code: 'low_vacancy', severity: 'caution', message: 'Vacancy under 3% is optimistic.' },
        {
          code: 'dscr_below_1',
          severity: 'risk',
          message: "Net operating income doesn't cover the debt.",
        },
      ],
    }
    const v = verdict(duplex, flagged)
    expect(v.answer).toBe('catch')
    expect(v.watch).toBe("Net operating income doesn't cover the debt.")
  })

  it('says no when the money never comes back', () => {
    const loser: Analysis = {
      ...analysis,
      metrics: { ...metrics, cash_flow: -2_400, irr: -0.02, total_profit: -9_000 },
    }
    const v = verdict(duplex, loser)
    expect(v.answer).toBe('no')
    expect(text(loser)).toBe('-$200 a month out of your pocket.')
  })

  it('writes the one line a deal card shows', () => {
    expect(oneLiner(duplex, { monthly_cash_flow: 308, irr: 0.155, total_profit: 1 })).toBe(
      '$308 a month, 15.5% a year',
    )
    const flip: Inputs = {
      strategy: 'flip',
      price: 139_000,
      rehab_cost: 38_000,
      after_repair_value: 232_000,
      property_tax_annual: 2_800,
      insurance_annual: 1_400,
    }
    expect(oneLiner(flip, { monthly_cash_flow: null, irr: null, total_profit: 21_729 })).toBe(
      '$21,729 profit',
    )
  })
})
