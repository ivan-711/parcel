import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { duplex } from '../../../lib/__tests__/fixtures'
import { dealsQuery, type Deal } from '../../../lib/api/queries'
import { Compare } from '../compare'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const get = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>())

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  api: { GET: get },
}))

function dealNamed(id: string, name: string): Deal {
  return {
    id,
    name,
    strategy: 'buy_and_hold',
    stage: 'analyzing',
    position: 0,
    address: null,
    inputs: duplex,
    provenance: {},
    notes: '',
    shared: false,
    acquired_on: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    summary: {
      irr: 0.15,
      monthly_cash_flow: 308,
      cash_on_cash: 0.06,
      cap_rate: 0.08,
      total_profit: 135_844,
      cash_to_close: 61_040,
      flags: 0,
    },
  }
}

// Newest first, the order the API lists them in.
const deals = [dealNamed('a', 'Newest'), dealNamed('b', 'Second'), dealNamed('c', 'Oldest')]

function mount(ids: string[]) {
  // The comparison itself never answers here; which deals are picked is what matters.
  get.mockImplementation(() => new Promise(() => undefined))
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(dealsQuery.queryKey, deals)
  render(
    <QueryClientProvider client={client}>
      <Compare ids={ids} />
    </QueryClientProvider>,
  )
}

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

describe('Compare', () => {
  afterEach(() => {
    cleanup()
    get.mockReset()
  })

  it('opens on the two most recent deals when none are chosen', () => {
    mount([])
    expect(pressed('Newest')).toBe(true)
    expect(pressed('Second')).toBe(true)
    expect(pressed('Oldest')).toBe(false)
  })

  it('keeps the one deal chosen and asks for another', () => {
    mount(['c'])
    expect(pressed('Oldest')).toBe(true)
    expect(pressed('Newest')).toBe(false)
    expect(pressed('Second')).toBe(false)
    expect(screen.getByText('Pick one more.')).toBeTruthy()
  })
})
