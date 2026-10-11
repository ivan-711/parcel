/**
 * What a new deal needs before the engine can run, per strategy.
 *
 * Everything else has a sensible default on the API side and can be tuned in
 * the workspace afterwards.
 */

import type { Inputs, Strategy } from './api/queries'
import type { Field } from './fields'

export interface StrategyInfo {
  value: Strategy
  name: string
  line: string
  required: Field[]
}

const rent: Field = {
  path: 'operations.monthly_rent',
  label: 'Rent',
  kind: 'monthly',
  help: 'What a tenant pays',
}
const tax: Field = {
  path: 'operations.property_tax_annual',
  label: 'Property tax',
  kind: 'money',
  help: 'A year',
}
const insurance: Field = {
  path: 'operations.insurance_annual',
  label: 'Insurance',
  kind: 'money',
  help: 'A year',
}
const flatTax: Field = { ...tax, path: 'property_tax_annual' }
const flatInsurance: Field = { ...insurance, path: 'insurance_annual' }
const price: Field = { path: 'price', label: 'Price', kind: 'money', help: "What you'd pay" }
const rehab: Field = {
  path: 'rehab_cost',
  label: 'Repairs',
  kind: 'money',
  help: 'Your estimate for the work',
}
const arv: Field = {
  path: 'after_repair_value',
  label: 'Value after repairs',
  kind: 'money',
  help: 'What it would sell for fixed up',
}

const RENTAL: StrategyInfo = {
  value: 'buy_and_hold',
  name: 'Rental',
  line: 'Buy it, rent it, hold it.',
  required: [price, rent, tax, insurance],
}

export const STRATEGIES: StrategyInfo[] = [
  RENTAL,
  {
    value: 'brrrr',
    name: 'BRRRR',
    line: 'Fix it, rent it, refinance your cash back out.',
    required: [
      price,
      rehab,
      {
        path: 'rehab_months',
        label: 'Months of work',
        kind: 'months',
        help: 'Until it can be rented',
      },
      arv,
      rent,
      tax,
      insurance,
    ],
  },
  {
    value: 'flip',
    name: 'Flip',
    line: 'Fix it and sell it inside a year.',
    required: [price, rehab, { ...arv, label: 'Resale price' }, flatTax, flatInsurance],
  },
  {
    value: 'wholesale',
    name: 'Wholesale',
    line: 'Put it under contract and assign it for a fee.',
    required: [
      {
        path: 'contract_price',
        label: 'Contract price',
        kind: 'money',
        help: 'What you agreed with the seller',
      },
      arv,
      { ...rehab, label: 'Repairs needed' },
      flatTax,
      flatInsurance,
    ],
  },
  {
    value: 'creative',
    name: 'Creative finance',
    line: 'Take over the seller’s loan, with a note for the rest.',
    required: [
      { ...price, help: 'What the seller gets in total' },
      rent,
      tax,
      insurance,
      {
        path: 'existing_balance',
        label: 'Their loan balance',
        kind: 'money',
        help: 'From the payoff statement',
      },
      {
        path: 'existing_rate',
        label: 'Their rate',
        kind: 'rate',
        help: 'From the payoff statement',
      },
      {
        path: 'existing_months_left',
        label: 'Months left on it',
        kind: 'months',
        help: 'From the payoff statement',
        min: 1,
      },
    ],
  },
]

export function infoFor(strategy: Strategy): StrategyInfo {
  return STRATEGIES.find((s) => s.value === strategy) ?? RENTAL
}

/** Where a suggestion for `path` lives on strategies that keep costs at the top level. */
export function suggestionKey(path: string): string {
  return path === 'property_tax_annual' || path === 'insurance_annual' ? `operations.${path}` : path
}

type Entered<T> = T extends number
  ? number | null
  : T extends object
    ? { [K in keyof T]: Entered<T[K]> }
    : T

/** A deal's inputs while they're being typed in, where a number not entered yet is null. */
export type Draft = Entered<Inputs>

export function blank(strategy: Strategy): Draft {
  switch (strategy) {
    case 'wholesale':
      return {
        strategy,
        contract_price: null,
        after_repair_value: null,
        rehab_cost: null,
        property_tax_annual: null,
        insurance_annual: null,
      }
    case 'flip':
      return {
        strategy,
        price: null,
        rehab_cost: null,
        after_repair_value: null,
        property_tax_annual: null,
        insurance_annual: null,
      }
    case 'brrrr':
      return {
        strategy,
        price: null,
        rehab_cost: null,
        rehab_months: null,
        after_repair_value: null,
        operations: { monthly_rent: null, property_tax_annual: null, insurance_annual: null },
      }
    case 'creative':
      return {
        strategy,
        price: null,
        existing_balance: null,
        existing_rate: null,
        existing_months_left: 1,
        operations: { monthly_rent: null, property_tax_annual: null, insurance_annual: null },
      }
    default:
      return {
        strategy: 'buy_and_hold',
        price: null,
        operations: { monthly_rent: null, property_tax_annual: null, insurance_annual: null },
      }
  }
}
