import { describe, expect, it } from 'vitest'

import { describeShare, withHead, type SharedDeal } from '../share-head'
import { analysis, duplex } from './fixtures'

const deal: SharedDeal = {
  name: 'Duplex on N 14th',
  strategy: 'buy_and_hold',
  address: { line1: '2210 N 14th St', city: 'Milwaukee', state: 'WI', zip: '53205' },
  inputs: duplex,
  provenance: {},
  analysis,
  updated_at: '2026-10-08T12:00:00Z',
}

const shell = '<html><head><meta charset="UTF-8" /><title>Parcel</title></head><body></body></html>'

describe('share link preview', () => {
  it('names the deal and leads with the verdict', () => {
    const head = describeShare(deal, 'https://parceldesk.io/r/abc')
    expect(head.title).toBe('Duplex on N 14th, a Parcel report')
    expect(head.description).toMatch(/^Rental at 2210 N 14th St, Milwaukee, WI\. /)
    expect(head.description).toContain('a month')
    expect(head.url).toBe('https://parceldesk.io/r/abc')
  })

  it('skips the address when there is none', () => {
    const head = describeShare({ ...deal, address: null }, 'https://parceldesk.io/r/abc')
    expect(head.description).toMatch(/^Rental\. /)
  })

  it('puts the tags where the plain title was, escaped', () => {
    const page = withHead(shell, {
      title: 'Tom & Jerry\'s "duplex" <3',
      description: 'A deal',
      url: 'https://parceldesk.io/r/abc',
    })
    expect(page.match(/<title>/g)).toHaveLength(1)
    expect(page).toContain("<title>Tom &amp; Jerry's &quot;duplex&quot; &lt;3</title>")
    expect(page).toContain(
      '<meta property="og:title" content="Tom &amp; Jerry\'s &quot;duplex&quot; &lt;3" />',
    )
    expect(page).toContain('<meta property="og:url" content="https://parceldesk.io/r/abc" />')
    expect(page).toContain('<meta name="robots" content="noindex" />')
    expect(page).not.toContain('<title>Parcel</title>')
  })

  it('still adds the tags to a shell without a title', () => {
    const page = withHead('<html><head></head><body></body></html>', {
      title: 'T',
      description: 'D',
      url: 'https://parceldesk.io/r/abc',
    })
    expect(page).toContain('<title>T</title>')
    expect(page.indexOf('<title>')).toBeLessThan(page.indexOf('</head>'))
  })
})
