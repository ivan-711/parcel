import { createFileRoute } from '@tanstack/react-router'

import { Landing } from '../features/landing/landing'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Parcel: know if a property makes money' },
      { property: 'og:title', content: 'Know if a property makes money.' },
      {
        property: 'og:description',
        content:
          'Paste an address, pick what you would do with it, and get a plain answer with the source of every number.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://parceldesk.io/' },
    ],
    links: [{ rel: 'canonical', href: 'https://parceldesk.io/' }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Parcel',
          url: 'https://parceldesk.io/',
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web',
          description:
            'Underwrite a rental, flip, BRRRR, wholesale or creative finance deal from an address, with every number traced to its source.',
        }),
      },
    ],
  }),
  component: Landing,
})
