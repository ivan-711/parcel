import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../../../api/share'
import { analysis, duplex } from './fixtures'

const token = 'Qm9iIGlzIGEgc2hhcmUgdG9rZW4gMTIz-_abc'
const shell = '<html><head><title>Parcel</title></head><body></body></html>'
const deal = {
  name: 'Duplex on N 14th',
  strategy: 'buy_and_hold',
  address: null,
  inputs: duplex,
  provenance: {},
  analysis,
  updated_at: '2026-10-08T12:00:00Z',
}

const fetchMock = vi.fn<typeof fetch>()

function answer(status: number, body: string) {
  return Promise.resolve(new Response(body, { status }))
}

function urlOf(input: string | URL | Request) {
  return input instanceof Request ? input.url : String(input)
}

function request(path: string) {
  return new Request(`https://parcel-abc.vercel.app${path}`, {
    headers: { 'x-forwarded-host': 'parceldesk.io' },
  })
}

describe('the share page function', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_URL', 'https://api.test')
    vi.stubEnv('VERCEL_URL', 'parcel-abc.vercel.app')
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input)
      if (url === 'https://parcel-abc.vercel.app/app.html') return answer(200, shell)
      if (url === `https://api.test/v1/shared/${token}`) return answer(200, JSON.stringify(deal))
      return answer(404, '{}')
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
  })

  it('serves the shell with the deal in the head and lets the edge cache it', async () => {
    const res = await GET(request(`/api/share?token=${token}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
    const html = await res.text()
    expect(html).toContain('<title>Duplex on N 14th, a Parcel report</title>')
    expect(html).toContain(`content="https://parceldesk.io/r/${token}"`)
  })

  it('answers 404 with the plain shell for a share that is gone', async () => {
    const res = await GET(request('/api/share?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('<title>Parcel</title>')
  })

  it('never asks the API about a token that could not be one', async () => {
    const res = await GET(request('/api/share?token=../etc/passwd'))
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the app to try again when the API is down', async () => {
    fetchMock.mockImplementation((input) =>
      urlOf(input).endsWith('/app.html') ? answer(200, shell) : Promise.reject(new Error('down')),
    )
    const res = await GET(request(`/api/share?token=${token}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('<title>Parcel</title>')
  })
})
