import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { meQuery, type Me } from '../../../lib/api/queries'
import { Settings } from '../settings'

interface Result {
  data?: unknown
  response: Response
}
interface Init {
  body?: { name?: string; defaults?: Record<string, number> }
}
type Call = (path: string, init?: Init) => Promise<Result>

const api = vi.hoisted(() => ({ PATCH: vi.fn<Call>(), POST: vi.fn<Call>() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  api,
}))

const me: Me = {
  id: 'u1',
  email: 'ivan@example.com',
  name: null,
  plan: 'free',
  is_demo: false,
  demo_expires_at: null,
  defaults: { interest_rate: 0.07, down_payment_rate: 0.2 },
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQuery.queryKey, me)
  render(
    <QueryClientProvider client={client}>
      <Settings />
    </QueryClientProvider>,
  )
}

function sentDefaults(): Record<string, number> | undefined {
  return api.PATCH.mock.calls[0]?.[1]?.body?.defaults
}

describe('Settings defaults', () => {
  beforeEach(() => {
    api.PATCH.mockResolvedValue({ data: me, response: new Response(null, { status: 200 }) })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reads a rate typed with its percent sign', async () => {
    mount()
    fireEvent.change(screen.getByLabelText(/Loan rate/), { target: { value: '6.5%' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.PATCH).toHaveBeenCalled())
    expect(sentDefaults()?.interest_rate).toBeCloseTo(0.065)
    expect(sentDefaults()?.down_payment_rate).toBeCloseTo(0.2)
    expect(await screen.findByText('Saved.')).toBeTruthy()
  })

  it('refuses to save a number it cannot read, and says which', async () => {
    mount()
    fireEvent.change(screen.getByLabelText(/Loan rate/), { target: { value: 'seven' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Couldn.t read the loan rate/)).toBeTruthy()
    expect(screen.queryByText('Saved.')).toBeNull()
    expect(api.PATCH).not.toHaveBeenCalled()
  })
})
