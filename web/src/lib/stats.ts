/**
 * The four numbers a deal leads with, and how each one explains itself.
 *
 * Every figure is read straight off the analysis; the explanation only quotes
 * them. `depends` names the inputs the trace lines point at.
 */

import {
  isWholesale,
  ledgerOf,
  type Analysis,
  type AnyAnalysis,
  type Inputs,
  type WholesaleAnalysis,
} from './api/queries'
import { getPath } from './paths'
import { money, moneySigned, months, multiple, percent } from './format'

export interface Stat {
  key: string
  /** Short name for the figure's cell: Cash flow, Return, Fee. */
  name: string
  value: string
  label: string
  bad?: boolean
  title: string
  explain: string
  depends: string[]
}

type Hold = Analysis
type Wholesale = WholesaleAnalysis

const pct = (v: unknown) => percent(typeof v === 'number' ? v : 0, 1)
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

function cashToClose(inputs: Inputs, a: Hold): Stat {
  const price = money(num(getPath(inputs, 'price')))
  const rehab = num(getPath(inputs, 'rehab_cost'))
  const closing = pct(getPath(inputs, 'closing_cost_rate'))
  let explain: string
  let depends: string[]
  switch (inputs.strategy) {
    case 'brrrr':
      explain = `The lender covers ${pct(inputs.loan_to_cost)} of the ${price} price and ${pct(inputs.rehab_financed)} of the ${money(rehab)} in repairs. You bring the rest, plus ${closing} in closing costs and the points.`
      depends = ['price', 'rehab_cost', 'loan_to_cost', 'rehab_financed']
      break
    case 'creative':
      explain = `${money(inputs.cash_to_seller ?? 0)} to the seller${inputs.arrears ? `, ${money(inputs.arrears)} of back payments` : ''}, and ${closing} of the ${price} price in closing costs${rehab ? `, plus ${money(rehab)} of repairs` : ''}.`
      depends = ['cash_to_seller', 'arrears', 'closing_cost_rate', 'rehab_cost']
      break
    case 'flip':
      explain = `The lender covers ${pct(inputs.loan_to_cost)} of the ${price} price and ${pct(inputs.rehab_financed)} of the repairs. You bring the rest, plus ${closing} in closing costs and the points.`
      depends = ['price', 'rehab_cost', 'loan_to_cost', 'rehab_financed']
      break
    default:
      explain = `A ${pct(getPath(inputs, 'down_payment_rate'))} down payment on ${price}, plus ${closing} in closing costs${rehab ? ` and ${money(rehab)} of repairs` : ''}.`
      depends = ['price', 'down_payment_rate', 'closing_cost_rate', 'rehab_cost']
  }
  return {
    key: 'cash_to_close',
    name: 'Cash to close',
    value: money(a.metrics.cash_to_close),
    label: 'paid on closing day',
    title: `Where ${money(a.metrics.cash_to_close)} comes from`,
    explain,
    depends,
  }
}

function irr(inputs: Inputs, a: Hold): Stat {
  const m = a.metrics
  const value = m.irr === null ? 'n/a' : percent(m.irr)
  const hold = months(a.horizon_months)
  const covered = m.total_invested - m.cash_to_close > 0.5
  const put = covered
    ? `${money(m.cash_to_close)} to close and ${money(m.total_invested)} all told, counting the months you had to cover`
    : money(m.cash_to_close)
  const explain =
    m.irr === null
      ? 'The return can’t be worked out because the money never comes back.'
      : `You put in ${put}. Over ${hold} you get back ${money(m.total_returned)}, ${money(m.net_sale_proceeds)} of it when you sell. That’s ${multiple(m.equity_multiple ?? 0)} your money, which works out to ${value} a year.`
  const rate =
    inputs.strategy === 'brrrr'
      ? 'refi_rate'
      : inputs.strategy === 'creative'
        ? 'seller_rate'
        : 'interest_rate'
  return {
    key: 'irr',
    name: 'Return',
    value,
    label: 'a year on your money',
    bad: (m.irr ?? 0) <= 0,
    title: `Where ${value} a year comes from`,
    explain,
    depends: ['price', 'operations.monthly_rent', rate, 'appreciation', 'hold_years'],
  }
}

function cashFlow(inputs: Inputs, a: Hold): Stat {
  const m = a.metrics
  const monthly = m.monthly_cash_flow ?? 0
  const rent = money(num(getPath(inputs, 'operations.monthly_rent')))
  const loan = inputs.strategy === 'creative' ? 'both loan payments' : 'the mortgage'
  return {
    key: 'cash_flow',
    name: 'Cash flow',
    value: moneySigned(monthly),
    label: monthly < 0 ? 'a month out of pocket' : 'a month in your pocket',
    bad: monthly < 0,
    title: `Where ${moneySigned(monthly)} a month comes from`,
    explain: `Rent of ${rent} a month, minus empty months, taxes, insurance, upkeep, reserves and ${loan}, leaves ${moneySigned(monthly)}. The breakdown below shows each piece.`,
    depends: [
      'operations.monthly_rent',
      'operations.vacancy_rate',
      'operations.property_tax_annual',
      'operations.insurance_annual',
    ],
  }
}

function dscr(inputs: Inputs, a: Hold): Stat {
  const d = a.metrics.dscr
  const value = d === null ? 'n/a' : multiple(d)
  const rate =
    inputs.strategy === 'creative'
      ? 'existing_rate'
      : inputs.strategy === 'brrrr'
        ? 'refi_rate'
        : 'interest_rate'
  return {
    key: 'dscr',
    name: 'Loan coverage',
    value,
    label: 'rent covers the loan',
    bad: (d ?? 0) < 1,
    title: `What ${value} means`,
    explain:
      d === null
        ? 'There is no loan payment to cover.'
        : `After costs, the rent brings in ${value} what the loan payment needs. Most lenders want at least 1.25x before they’ll lend, and under 1.0x the rent doesn’t cover the payment.`,
    depends: [
      'operations.monthly_rent',
      rate,
      'operations.property_tax_annual',
      'operations.insurance_annual',
    ],
  }
}

function brrrrRefi(a: Hold): Stat[] {
  const m = a.metrics
  return [
    {
      key: 'refi_cash_out',
      name: 'Cash out',
      value: money(Math.max(m.refi_cash_out, 0)),
      label: 'back at the refinance',
      bad: m.refi_cash_out < 0,
      title: `Where ${money(Math.max(m.refi_cash_out, 0))} comes from`,
      explain:
        m.refi_cash_out >= 0
          ? `The new loan pays off the purchase loan and the refinance costs, and ${money(m.refi_cash_out)} is left over for you.`
          : `The new loan isn’t big enough to pay off the purchase loan. You’d bring ${money(-m.refi_cash_out)} to the refinance.`,
      depends: ['after_repair_value', 'refi_ltv', 'price', 'rehab_cost'],
    },
    {
      key: 'cash_left_in_deal',
      name: 'Left in',
      value: money(Math.max(m.cash_left_in_deal, 0)),
      label: 'still in the deal after',
      title: `Where ${money(Math.max(m.cash_left_in_deal, 0))} comes from`,
      explain: `You put in ${money(m.peak_cash)} at the most. After the refinance returns some of it, ${money(Math.max(m.cash_left_in_deal, 0))} stays in the property until you sell.`,
      depends: ['price', 'rehab_cost', 'after_repair_value', 'refi_ltv'],
    },
  ]
}

function flipStats(inputs: Inputs & { strategy: 'flip' }, a: Hold): Stat[] {
  const m = a.metrics
  return [
    {
      key: 'total_profit',
      name: 'Profit',
      value: moneySigned(m.total_profit),
      label: 'profit',
      bad: m.total_profit <= 0,
      title: `Where ${moneySigned(m.total_profit)} comes from`,
      explain: `Sell for ${money(inputs.after_repair_value)}, pay ${pct(inputs.selling_cost_rate)} to sell, pay off the loan, and subtract the ${money(inputs.price)} price, ${money(inputs.rehab_cost)} of repairs and every month of interest, taxes and insurance along the way.`,
      depends: ['after_repair_value', 'price', 'rehab_cost', 'selling_cost_rate'],
    },
    {
      key: 'roi',
      name: 'Return',
      value: m.roi === null ? 'n/a' : percent(m.roi, 0),
      label: 'return on your cash',
      bad: (m.roi ?? 0) <= 0,
      title: `Where ${m.roi === null ? 'the return' : percent(m.roi, 0)} comes from`,
      explain: `${moneySigned(m.total_profit)} of profit on ${money(m.peak_cash)} of your own cash at the deepest point.`,
      depends: ['loan_to_cost', 'rehab_financed', 'price', 'rehab_cost'],
    },
    cashToClose(inputs, a),
    {
      key: 'horizon',
      name: 'Timeline',
      value: months(a.horizon_months),
      label: 'start to finish',
      title: `Why ${months(a.horizon_months)}`,
      explain: `${months(inputs.rehab_months ?? 0)} of work, then ${months(inputs.months_to_sell ?? 0)} to find a buyer and close.`,
      depends: ['rehab_months', 'months_to_sell'],
    },
  ]
}

function wholesaleStats(inputs: Inputs & { strategy: 'wholesale' }, w: Wholesale): Stat[] {
  const fee = w.assignment_fee ?? 0
  return [
    {
      key: 'assignment_fee',
      name: 'Your fee',
      value: moneySigned(fee),
      label: 'your fee',
      bad: fee <= 0,
      title: `Where ${moneySigned(fee)} comes from`,
      explain: `The most a flipper can pay and still make ${pct(inputs.buyer_profit_margin)} on the resale, minus your ${money(inputs.contract_price)} contract price.`,
      depends: ['contract_price', 'after_repair_value', 'rehab_cost', 'buyer_profit_margin'],
    },
    {
      key: 'buyer_max_price',
      name: "Buyer's ceiling",
      value: w.buyer_max_price === null ? 'n/a' : money(w.buyer_max_price),
      label: 'most a buyer can pay',
      title: 'How the buyer’s number is found',
      explain: `Run the buyer’s flip backwards: a ${money(inputs.after_repair_value)} resale, ${money(inputs.rehab_cost)} of repairs, their loan costs and ${pct(inputs.buyer_profit_margin)} profit, and solve for the price that makes it work.`,
      depends: ['after_repair_value', 'rehab_cost', 'buyer_interest_rate', 'buyer_months_to_sell'],
    },
    {
      key: 'seventy',
      name: '70% rule',
      value: money(w.seventy_percent_rule),
      label: 'the 70% rule says',
      title: 'The rule of thumb',
      explain: `Flippers often cap their price at 70% of the resale value minus repairs. Here that’s ${money(w.seventy_percent_rule)}. The buyer’s number above is the careful version.`,
      depends: ['after_repair_value', 'rehab_cost'],
    },
    {
      key: 'earnest',
      name: 'At risk',
      value: money(w.earnest_money),
      label: 'at risk if you walk',
      title: 'Your downside',
      explain: `If no buyer shows up before closing, the ${money(w.earnest_money)} of earnest money is what you lose.`,
      depends: ['earnest_money'],
    },
  ]
}

export function statsFor(inputs: Inputs, analysis: AnyAnalysis): Stat[] {
  if (inputs.strategy === 'wholesale' && isWholesale(analysis))
    return wholesaleStats(inputs, analysis)
  const a = ledgerOf(analysis)
  switch (inputs.strategy) {
    case 'flip':
      return flipStats(inputs, a)
    case 'brrrr':
      return [cashFlow(inputs, a), irr(inputs, a), ...brrrrRefi(a)]
    default:
      return [cashFlow(inputs, a), irr(inputs, a), cashToClose(inputs, a), dscr(inputs, a)]
  }
}
