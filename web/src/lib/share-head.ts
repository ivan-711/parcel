import type { Schemas } from './api/analysis.js'
import { STRATEGY_NAMES, verdict } from './words.js'

export type SharedDeal = Schemas['SharedDeal']

export interface ShareHead {
  title: string
  description: string
  url: string
}

/** What a link preview says about a shared deal, in the report's own words. */
export function describeShare(deal: SharedDeal, url: string): ShareHead {
  const address = deal.address
    ? [deal.address.line1, deal.address.city, deal.address.state].filter(Boolean).join(', ')
    : ''
  const words = verdict(deal.inputs, deal.analysis)
  const sentence = words.parts.map((p) => p.text).join('')
  const where = `${STRATEGY_NAMES[deal.strategy]}${address ? ` at ${address}` : ''}.`
  return {
    title: `${deal.name}, a Parcel report`,
    description: `${where} ${words.headline}: ${sentence}`,
    url,
  }
}

function escape(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )
}

/** The app shell with the deal's title and preview tags in place of the plain title. */
export function withHead(shell: string, head: ShareHead): string {
  const tags = [
    `<title>${escape(head.title)}</title>`,
    `<meta name="description" content="${escape(head.description)}" />`,
    '<meta name="robots" content="noindex" />',
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="Parcel" />',
    `<meta property="og:title" content="${escape(head.title)}" />`,
    `<meta property="og:description" content="${escape(head.description)}" />`,
    `<meta property="og:url" content="${escape(head.url)}" />`,
    '<meta name="twitter:card" content="summary" />',
  ].join('\n    ')
  return /<title>[^<]*<\/title>/.test(shell)
    ? shell.replace(/<title>[^<]*<\/title>/, tags)
    : shell.replace('</head>', `${tags}\n  </head>`)
}
