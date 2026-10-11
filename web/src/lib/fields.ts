/**
 * What each input means to a person, grouped the way the inspector shows them.
 *
 * `help` is the caption shown when no provider supplied the value. Fields marked
 * `more` stay folded until the group is expanded.
 */

import type { Inputs, Strategy } from './api/queries'

export type Kind = 'money' | 'rate' | 'months' | 'years' | 'monthly'

export interface Field {
  path: string
  label: string
  kind: Kind
  help?: string
  more?: boolean
  optional?: boolean
  /** The lowest value the API takes, when that isn't 0. */
  min?: number
}

export interface Group {
  title: string
  fields: Field[]
}

const DEFAULT = 'Common planning number'
const YOURS = 'Your number'

const ops = {
  rent: { path: 'operations.monthly_rent', label: 'Rent', kind: 'monthly', help: YOURS },
  tax: {
    path: 'operations.property_tax_annual',
    label: 'Property tax',
    kind: 'money',
    help: YOURS,
  },
  insurance: {
    path: 'operations.insurance_annual',
    label: 'Insurance',
    kind: 'money',
    help: YOURS,
  },
  vacancy: {
    path: 'operations.vacancy_rate',
    label: 'Empty',
    kind: 'rate',
    help: 'Share of the year with no tenant',
  },
  management: {
    path: 'operations.management_rate',
    label: 'Management',
    kind: 'rate',
    help: 'Share of rent',
  },
  maintenance: {
    path: 'operations.maintenance_rate',
    label: 'Repairs',
    kind: 'rate',
    help: 'Share of rent',
  },
  capex: {
    path: 'operations.capex_rate',
    label: 'Reserves',
    kind: 'rate',
    help: 'Set aside for big items, share of rent',
  },
  hoa: { path: 'operations.hoa_monthly', label: 'HOA', kind: 'monthly', help: YOURS, more: true },
  utilities: {
    path: 'operations.utilities_monthly',
    label: 'Utilities you pay',
    kind: 'monthly',
    help: YOURS,
    more: true,
  },
  other: {
    path: 'operations.other_income_monthly',
    label: 'Other income',
    kind: 'monthly',
    help: 'Laundry, parking, storage',
    more: true,
  },
  rentGrowth: {
    path: 'operations.rent_growth',
    label: 'Rent growth',
    kind: 'rate',
    help: DEFAULT,
    more: true,
  },
  expenseGrowth: {
    path: 'operations.expense_growth',
    label: 'Cost growth',
    kind: 'rate',
    help: DEFAULT,
    more: true,
  },
  leaseUp: {
    path: 'operations.lease_up_months',
    label: 'Months to find a tenant',
    kind: 'months',
    help: YOURS,
    more: true,
  },
} satisfies Record<string, Field>

const costs: Group = {
  title: 'Costs each year',
  fields: [
    ops.tax,
    ops.insurance,
    ops.vacancy,
    ops.management,
    ops.maintenance,
    ops.capex,
    ops.hoa,
    ops.utilities,
    ops.other,
  ],
}

const selling = (extra: Field[] = []): Group => ({
  title: 'Growth and selling',
  fields: [
    { path: 'appreciation', label: 'Value growth', kind: 'rate', help: DEFAULT },
    { path: 'hold_years', label: 'Hold', kind: 'years', help: YOURS },
    {
      path: 'selling_cost_rate',
      label: 'Selling costs',
      kind: 'rate',
      help: 'Agent fees and closing, share of price',
    },
    ops.rentGrowth,
    ops.expenseGrowth,
    ...extra,
  ],
})

const rehab: Field[] = [
  { path: 'rehab_cost', label: 'Repairs before renting', kind: 'money', help: YOURS, more: true },
  { path: 'rehab_months', label: 'Months of work', kind: 'months', help: YOURS, more: true },
  {
    path: 'after_repair_value',
    label: 'Value after repairs',
    kind: 'money',
    help: YOURS,
    more: true,
    optional: true,
  },
]

export const GROUPS: Record<Strategy, Group[]> = {
  buy_and_hold: [
    {
      title: 'Property',
      fields: [
        { path: 'price', label: 'Price', kind: 'money', help: "What you'd pay" },
        ops.rent,
        {
          path: 'down_payment_rate',
          label: 'Down payment',
          kind: 'rate',
          help: 'Typical for a rental',
        },
        ...rehab,
        ops.leaseUp,
      ],
    },
    {
      title: 'Loan',
      fields: [
        { path: 'interest_rate', label: 'Loan rate', kind: 'rate', help: YOURS },
        { path: 'amort_years', label: 'Term', kind: 'years', help: DEFAULT },
        { path: 'closing_cost_rate', label: 'Closing costs', kind: 'rate', help: 'Share of price' },
        {
          path: 'points',
          label: 'Points',
          kind: 'rate',
          help: 'Paid up front, share of the loan',
          more: true,
        },
      ],
    },
    costs,
    selling([
      {
        path: 'exit_cap_rate',
        label: 'Sale cap rate',
        kind: 'rate',
        help: 'Leave blank to use value growth',
        more: true,
        optional: true,
      },
    ]),
  ],
  brrrr: [
    {
      title: 'Property',
      fields: [
        { path: 'price', label: 'Price', kind: 'money', help: "What you'd pay" },
        { path: 'rehab_cost', label: 'Repairs', kind: 'money', help: YOURS },
        { path: 'rehab_months', label: 'Months of work', kind: 'months', help: YOURS },
        { path: 'after_repair_value', label: 'Value after repairs', kind: 'money', help: YOURS },
        ops.rent,
        ops.leaseUp,
      ],
    },
    {
      title: 'Purchase loan',
      fields: [
        { path: 'loan_to_cost', label: 'Loan covers', kind: 'rate', help: 'Share of the price' },
        {
          path: 'rehab_financed',
          label: 'Repairs financed',
          kind: 'rate',
          help: 'Share of repairs the lender funds',
        },
        {
          path: 'acquisition_rate',
          label: 'Loan rate',
          kind: 'rate',
          help: 'Hard money, interest only',
        },
        { path: 'acquisition_points', label: 'Points', kind: 'rate', help: DEFAULT, more: true },
        {
          path: 'closing_cost_rate',
          label: 'Closing costs',
          kind: 'rate',
          help: 'Share of price',
          more: true,
        },
      ],
    },
    {
      title: 'Refinance',
      fields: [
        {
          path: 'seasoning_months',
          label: 'Wait',
          kind: 'months',
          help: 'Months before a bank will refinance',
        },
        {
          path: 'refi_ltv',
          label: 'New loan covers',
          kind: 'rate',
          help: 'Share of the new value',
        },
        { path: 'refi_rate', label: 'New loan rate', kind: 'rate', help: YOURS },
        { path: 'refi_amort_years', label: 'New term', kind: 'years', help: DEFAULT, more: true },
        {
          path: 'refi_closing_cost_rate',
          label: 'Refinance costs',
          kind: 'rate',
          help: 'Share of the new loan',
          more: true,
        },
      ],
    },
    costs,
    selling(),
  ],
  flip: [
    {
      title: 'Property',
      fields: [
        { path: 'price', label: 'Price', kind: 'money', help: "What you'd pay" },
        { path: 'rehab_cost', label: 'Repairs', kind: 'money', help: YOURS },
        { path: 'after_repair_value', label: 'Resale price', kind: 'money', help: YOURS },
        { path: 'rehab_months', label: 'Months of work', kind: 'months', help: YOURS },
        { path: 'months_to_sell', label: 'Months to sell', kind: 'months', help: DEFAULT },
      ],
    },
    {
      title: 'Loan',
      fields: [
        {
          path: 'loan_to_cost',
          label: 'Loan covers',
          kind: 'rate',
          help: 'Share of the price. Zero means all cash.',
        },
        {
          path: 'rehab_financed',
          label: 'Repairs financed',
          kind: 'rate',
          help: 'Share of repairs the lender funds',
        },
        {
          path: 'interest_rate',
          label: 'Loan rate',
          kind: 'rate',
          help: 'Hard money, interest only',
        },
        { path: 'points', label: 'Points', kind: 'rate', help: DEFAULT, more: true },
        {
          path: 'closing_cost_rate',
          label: 'Closing costs',
          kind: 'rate',
          help: 'Share of price',
          more: true,
        },
      ],
    },
    {
      title: 'Carrying and selling',
      fields: [
        { path: 'property_tax_annual', label: 'Property tax', kind: 'money', help: YOURS },
        { path: 'insurance_annual', label: 'Insurance', kind: 'money', help: YOURS },
        { path: 'utilities_monthly', label: 'Utilities', kind: 'monthly', help: YOURS },
        {
          path: 'selling_cost_rate',
          label: 'Selling costs',
          kind: 'rate',
          help: 'Agent fees and closing, share of price',
        },
      ],
    },
  ],
  creative: [
    {
      title: 'Property',
      fields: [
        { path: 'price', label: 'Price', kind: 'money', help: 'What the seller gets in total' },
        ops.rent,
        {
          path: 'cash_to_seller',
          label: 'Cash to the seller',
          kind: 'money',
          help: 'Your down payment',
        },
        {
          path: 'arrears',
          label: 'Back payments you cover',
          kind: 'money',
          help: YOURS,
          more: true,
        },
        ...rehab,
        ops.leaseUp,
      ],
    },
    {
      title: 'Their loan you take over',
      fields: [
        {
          path: 'existing_balance',
          label: 'Balance',
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
          label: 'Months left',
          kind: 'months',
          help: 'From the payoff statement',
        },
      ],
    },
    {
      title: 'Note to the seller',
      fields: [
        { path: 'seller_rate', label: 'Note rate', kind: 'rate', help: 'What you negotiate' },
        {
          path: 'seller_amort_years',
          label: 'Paid off over',
          kind: 'years',
          help: DEFAULT,
          optional: true,
        },
        {
          path: 'seller_balloon_years',
          label: 'Balloon due in',
          kind: 'years',
          help: 'Leave blank for none',
          optional: true,
        },
        {
          path: 'closing_cost_rate',
          label: 'Closing costs',
          kind: 'rate',
          help: 'Share of price',
          more: true,
        },
      ],
    },
    costs,
    selling(),
  ],
  wholesale: [
    {
      title: 'Your contract',
      fields: [
        {
          path: 'contract_price',
          label: 'Contract price',
          kind: 'money',
          help: 'What you agreed with the seller',
        },
        { path: 'after_repair_value', label: 'Value after repairs', kind: 'money', help: YOURS },
        { path: 'rehab_cost', label: 'Repairs needed', kind: 'money', help: YOURS },
        {
          path: 'earnest_money',
          label: 'Earnest money',
          kind: 'money',
          help: 'What you lose if you walk',
        },
        {
          path: 'buyer_profit_margin',
          label: 'Profit the buyer wants',
          kind: 'rate',
          help: 'Share of resale, typical for flippers',
        },
      ],
    },
    {
      title: "The buyer's flip",
      fields: [
        { path: 'buyer_rehab_months', label: 'Months of work', kind: 'months', help: DEFAULT },
        { path: 'buyer_months_to_sell', label: 'Months to sell', kind: 'months', help: DEFAULT },
        {
          path: 'buyer_loan_to_cost',
          label: 'Loan covers',
          kind: 'rate',
          help: 'Share of their price',
          more: true,
        },
        {
          path: 'buyer_rehab_financed',
          label: 'Repairs financed',
          kind: 'rate',
          help: DEFAULT,
          more: true,
        },
        {
          path: 'buyer_interest_rate',
          label: 'Their rate',
          kind: 'rate',
          help: 'Hard money, interest only',
          more: true,
        },
        { path: 'buyer_points', label: 'Their points', kind: 'rate', help: DEFAULT, more: true },
        {
          path: 'property_tax_annual',
          label: 'Property tax',
          kind: 'money',
          help: YOURS,
          more: true,
        },
        { path: 'insurance_annual', label: 'Insurance', kind: 'money', help: YOURS, more: true },
      ],
    },
  ],
}

export function fieldsFor(strategy: Strategy): Field[] {
  return GROUPS[strategy].flatMap((g) => g.fields)
}

export function strategyOf(inputs: Inputs): Strategy {
  return inputs.strategy
}
