import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analysis, duplex } from '../../../../lib/__tests__/fixtures'
import type { MemoEvent } from '../../../../lib/api/memo'
import { dealQuery, type DealDetail } from '../../../../lib/api/queries'
import { Workspace } from '../workspace'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

interface Result {
  data: unknown
  response: Response
}
type Call = (path: string) => Promise<Result>

const api = vi.hoisted(() => ({
  GET: vi.fn<Call>(),
  POST: vi.fn<Call>(),
  PATCH: vi.fn<Call>(),
  DELETE: vi.fn<Call>(),
}))

vi.mock('../../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/client')>()),
  api,
}))

const write = vi.hoisted(() =>
  vi.fn<(dealId: string, signal?: AbortSignal) => AsyncGenerator<MemoEvent>>(),
)

vi.mock('../../../../lib/api/memo', () => ({ writeMemo: write }))

const DEAL_ID = '6f1c5a8e-2d1b-4c4e-9a43-0a6f6a9c1b11'

const deal: DealDetail = {
  id: DEAL_ID,
  name: 'Duplex on Main St',
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
  analysis,
}

/** A memo that gets as far as its first words and then keeps the connection open. */
async function* stalled(): AsyncGenerator<MemoEvent> {
  yield { kind: 'draft', text: 'The duplex on Main St' }
  await new Promise(() => undefined)
}

/** A memo whose stream closes after the first words, with no final event. */
async function* cutOff(): AsyncGenerator<MemoEvent> {
  await Promise.resolve()
  yield { kind: 'draft', text: 'The duplex on Main St' }
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(dealQuery(DEAL_ID).queryKey, deal)
  return render(
    <QueryClientProvider client={client}>
      <Workspace dealId={DEAL_ID} />
    </QueryClientProvider>,
  )
}

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

describe('writing the memo', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    api.GET.mockImplementation((path) =>
      Promise.resolve(
        path.endsWith('/memo')
          ? { data: undefined, response: new Response(null, { status: 404 }) }
          : { data: deal, response: new Response(null, { status: 200 }) },
      ),
    )
    api.POST.mockResolvedValue({ data: analysis, response: new Response(null, { status: 200 }) })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('writes once, and keeps going while the tabs change', async () => {
    write.mockImplementation(stalled)
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Write memo' }))
    expect(await screen.findByText('The duplex on Main St')).toBeTruthy()
    expect(write).toHaveBeenCalledTimes(1)

    tab('Overview')
    expect(screen.queryByText('The duplex on Main St')).toBeNull()
    tab('Memo')
    expect(await screen.findByText('The duplex on Main St')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Writing' })).toBeTruthy()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('says so when the stream stops before the memo is finished', async () => {
    write.mockImplementation(cutOff)
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Write memo' }))
    expect(await screen.findByText(/cut off before it finished/)).toBeTruthy()
    const again = screen.getByRole<HTMLButtonElement>('button', { name: 'Write the memo' })
    expect(again.disabled).toBe(false)
  })
})
