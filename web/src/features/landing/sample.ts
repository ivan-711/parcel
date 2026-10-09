/**
 * The duplex every visitor sees first. These are the engine's own figures for
 * the demo's "Duplex on N 14th" deal; the demo opens the live version.
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
