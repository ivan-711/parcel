import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { duplex } from '../../../lib/__tests__/fixtures'
import { dealsQuery, portfolioQuery, type Deal, type Portfolio } from '../../../lib/api/queries'
import { Pipeline } from '../pipeline'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

interface Result {
  data: unknown
  response: Response
}
type Call = (path: string) => Promise<Result>

const api = vi.hoisted(() => ({ GET: vi.fn<Call>(), PUT: vi.fn<Call>() }))

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  api,
}))

const deal: Deal = {
  id: '6f1c5a8e-2d1b-4c4e-9a43-0a6f6a9c1b11',
  name: 'Duplex on Main St',
  strategy: 'buy_and_hold',
  stage: 'under_contract',
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

const portfolio: Portfolio = {
  properties: [],
  projected_to_date: 0,
  actual_to_date: 0,
  variance_to_date: 0,
  variance_rate: null,
  monthly_projected_now: 0,
}

const ok = (data: unknown): Result => ({ data, response: new Response(null, { status: 200 }) })

describe('Pipeline', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('refreshes the portfolio when a deal becomes owned', async () => {
    const owned = { ...deal, stage: 'owned' as const }
    api.PUT.mockResolvedValue(ok(owned))
    api.GET.mockResolvedValue(ok([owned]))
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    })
    client.setQueryData(dealsQuery.queryKey, [deal])
    client.setQueryData(portfolioQuery.queryKey, portfolio)
    render(
      <QueryClientProvider client={client}>
        <Pipeline />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('Move Duplex on Main St'), {
      target: { value: 'owned' },
    })
    await waitFor(() => expect(api.PUT).toHaveBeenCalled())
    await waitFor(() =>
      expect(client.getQueryState(portfolioQuery.queryKey)?.isInvalidated).toBe(true),
    )
  })
})
