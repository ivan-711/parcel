/**
 * The duplex every visitor sees first, and the other four sample deals.
 *
 * These are the engine's own figures for the demo deals, copied here so the
 * landing page can show them without a session; the demo opens the live versions.
 */
export const sample = {
  address: '1420 N 14th St, Sheboygan, WI',
  kind: 'Duplex · Rental',
  cashFlowMonthly: 308,
  irr: 0.1547,
  cashToClose: 61_040,
  price: 218_000,
  breakEven: 0.79,
  sources: [
    {
      id: 'rent',
      label: 'Rent',
      value: '$2,350 a month',
      from: 'RentCast rent estimate, $2,150 to $2,560',
    },
    {
      id: 'tax',
      label: 'Property tax',
      value: '$3,900 a year',
      from: 'County tax rate of 1.74%, Census ACS',
    },
    { id: 'rate', label: 'Loan rate', value: '6.75%', from: 'Freddie Mac average plus 0.5%' },
    { id: 'insurance', label: 'Insurance', value: '$1,650 a year', from: 'Your quote' },
  ],
} as const

export interface SampleDeal {
  strategy: string
  name: string
  where: string
  answer: 'yes' | 'catch'
  /** The sentence the workspace leads with; lit parts are the traceable figures. */
  parts: { text: string; lit?: boolean }[]
  watch: string
}

export const deals: SampleDeal[] = [
  {
    strategy: 'Rental',
    name: 'Duplex on N 14th',
    where: '1420 N 14th St',
    answer: 'yes',
    parts: [
      { text: '$308 a month', lit: true },
      { text: ' in your pocket, and your money grows ' },
      { text: '15.5% a year', lit: true },
      { text: '.' },
    ],
    watch: 'it needs to be rented 79% of the time to cover its costs.',
  },
  {
    strategy: 'BRRRR',
    name: 'Ranch on Kohler Ave',
    where: '2210 Kohler Ave',
    answer: 'catch',
    parts: [
      { text: 'You get ' },
      { text: '$10,219', lit: true },
      { text: ' back at the refinance, leave ' },
      { text: '$19,393', lit: true },
      { text: ' in the deal, and clear ' },
      { text: '-$16 a month', lit: true },
      { text: '.' },
    ],
    watch: 'The stabilized year loses money every month.',
  },
  {
    strategy: 'Flip',
    name: 'Cape Cod on Erie Ave',
    where: '915 Erie Ave',
    answer: 'yes',
    parts: [
      { text: '$21,729 profit', lit: true },
      { text: ' in ' },
      { text: '5 months', lit: true },
      { text: ', on ' },
      { text: '$19,182', lit: true },
      { text: ' of your own cash.' },
    ],
    watch: 'Profit is under 10% of the resale price, little room for surprises.',
  },
  {
    strategy: 'Wholesale',
    name: 'Estate sale on Michigan Ave',
    where: '1104 Michigan Ave',
    answer: 'yes',
    parts: [
      { text: 'A ' },
      { text: '$2,586 assignment fee', lit: true },
      { text: ' if you find a buyer willing to pay up to ' },
      { text: '$98,586', lit: true },
      { text: '.' },
    ],
    watch: 'The room for an assignment fee is under $5,000.',
  },
  {
    strategy: 'Creative finance',
    name: 'Subject-to fourplex',
    where: '3305 S 12th St',
    answer: 'yes',
    parts: [
      { text: '$941 a month', lit: true },
      { text: ' in your pocket, and your money grows ' },
      { text: '90.4% a year', lit: true },
      { text: '.' },
    ],
    watch: 'A $78,324 balloon payment comes due in month 84.',
  },
]
