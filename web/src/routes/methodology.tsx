import { createFileRoute } from '@tanstack/react-router'

import { Methodology } from '../features/methodology/methodology'

export const Route = createFileRoute('/methodology')({
  head: () => ({
    meta: [
      { title: 'How Parcel does the math' },
      {
        name: 'description',
        content:
          'Every rule behind Parcel: the month by month ledger, each strategy, every metric, reverse solving, sensitivity, the simulation, flags and data sources.',
      },
    ],
    links: [{ rel: 'canonical', href: 'https://parceldesk.io/methodology' }],
  }),
  component: Methodology,
})
