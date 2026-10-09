/**
 * Turns the engine's figures into the sentences the app leads with.
 *
 * Nothing here computes: it picks figures the API already returned and
 * phrases them for someone who doesn't speak IRR.
 */

import { money, moneySigned, months, multiple, percent } from './format'
import { isWholesale, ledgerOf, type AnyAnalysis, type Flag, type Inputs } from './api/queries'

export interface Part {
  text: string
  lit?: boolean
}

export type Answer = 'yes' | 'catch' | 'no'

export interface Verdict {
  answer: Answer
  headline: string
  parts: Part[]
  watch: string | null
}

const HEADLINES: Record<Answer, string> = {
  yes: 'Yes, it works',
  catch: 'It works, with a catch',
  no: 'No, not at this price',
}

function worst(flags: Flag[]): Flag | undefined {
  return flags.find((f) => f.severity === 'risk') ?? flags.find((f) => f.severity === 'caution')
}

function answer(positive: boolean, flags: Flag[], catches = false): Answer {
  if (!positive) return 'no'
  return catches || flags.some((f) => f.severity === 'risk') ? 'catch' : 'yes'
}

function perMonth(annual: number | null | undefined): string {
  return moneySigned((annual ?? 0) / 12)
}

export function verdict(inputs: Inputs, analysis: AnyAnalysis): Verdict {
  if (isWholesale(analysis)) {
    const w = analysis
    const fee = w.assignment_fee
    const ok = fee !== null && fee > 0
    const parts: Part[] = ok
      ? [
          { text: 'A ', lit: false },
          { text: `${money(fee)} assignment fee`, lit: true },
          { text: ' if you find a buyer willing to pay up to ' },
          { text: money(w.buyer_max_price ?? 0), lit: true },
          { text: '.' },
        ]
      : [
          { text: 'No buyer can pay more than your ' },
          { text: money(w.contract_price), lit: true },
          { text: ' contract and still make money on the flip.' },
        ]
    const flag = worst(w.flags)
    return {
      answer: answer(ok, w.flags),
      headline: HEADLINES[answer(ok, w.flags)],
      parts,
      watch: flag?.message ?? null,
    }
  }

  const a = ledgerOf(analysis)
  const m = a.metrics
  const flag = worst(a.flags)
  let parts: Part[]
  let ok: boolean

  switch (inputs.strategy) {
    case 'flip': {
      ok = m.total_profit > 0
      parts = [
        { text: `${moneySigned(m.total_profit)} profit`, lit: true },
        { text: ' in ' },
        { text: months(a.horizon_months), lit: true },
        { text: ', on ' },
        { text: money(m.cash_to_close), lit: true },
        { text: ' of your own cash.' },
      ]
      break
    }
    case 'brrrr': {
      ok = m.total_profit > 0 && (m.irr ?? 0) > 0
      parts = [
        { text: 'You get ' },
        { text: money(Math.max(m.refi_cash_out, 0)), lit: true },
        { text: ' back at the refinance, leave ' },
        { text: money(Math.max(m.cash_left_in_deal, 0)), lit: true },
        { text: ' in the deal, and clear ' },
        { text: `${perMonth(m.cash_flow)} a month`, lit: true },
        { text: '.' },
      ]
      break
    }
    default: {
      ok = m.total_profit > 0 && (m.irr ?? 0) > 0
      const positive = (m.cash_flow ?? 0) > 0
      parts = [
        { text: `${perMonth(m.cash_flow)} a month`, lit: true },
        { text: positive ? ' in your pocket, and your money grows ' : ' out of your pocket' },
      ]
      if (positive && m.irr !== null)
        parts.push({ text: `${percent(m.irr)} a year`, lit: true }, { text: '.' })
      else if (m.irr !== null && m.irr > 0)
        parts.push(
          { text: ', though it still returns ' },
          { text: `${percent(m.irr)} a year`, lit: true },
          { text: ' by the time you sell.' },
        )
      else parts.push({ text: '.' })
    }
  }

  const result = answer(ok, a.flags, (m.cash_flow ?? 0) < 0)
  let watch = flag?.message ?? null
  if (!watch && m.break_even_occupancy !== null && m.break_even_occupancy > 0.8) {
    watch = `it needs to be rented ${percent(m.break_even_occupancy, 0)} of the time to cover its costs.`
  }
  return { answer: result, headline: HEADLINES[result], parts, watch }
}

/** The one line a deal card shows under its name. */
export function oneLiner(
  inputs: Inputs,
  summary: { monthly_cash_flow: number | null; irr: number | null; total_profit: number },
): string {
  switch (inputs.strategy) {
    case 'wholesale':
      return summary.total_profit > 0
        ? `${money(summary.total_profit)} fee`
        : 'No spread for a buyer'
    case 'flip':
      return `${moneySigned(summary.total_profit)} profit`
    default: {
      const cf = summary.monthly_cash_flow ?? 0
      const irr = summary.irr === null ? '' : `, ${percent(summary.irr)} a year`
      return `${moneySigned(cf)} a month${irr}`
    }
  }
}

export const STRATEGY_NAMES: Record<Inputs['strategy'], string> = {
  buy_and_hold: 'Rental',
  brrrr: 'BRRRR',
  flip: 'Flip',
  creative: 'Creative finance',
  wholesale: 'Wholesale',
}

export const STAGE_NAMES = {
  lead: 'Lead',
  analyzing: 'Analyzing',
  offer: 'Offer out',
  under_contract: 'Under contract',
  owned: 'Owned',
  passed: 'Passed',
} as const

export { multiple }
