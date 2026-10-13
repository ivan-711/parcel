import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analysis, duplex } from '../../../../lib/__tests__/fixtures'
import {
  dealQuery,
  type DealDetail,
  type Inputs,
  type Provenance,
} from '../../../../lib/api/queries'
import { setPath } from '../../../../lib/paths'
import { Workspace } from '../workspace'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}))

interface Init {
  body: { inputs: Inputs; provenance: Provenance }
  keepalive?: boolean
}
interface Result {
  data: unknown
  response: Response
}
type Call = (path: string, init: Init) => Promise<Result>

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

const ok = () => new Response(null, { status: 200 })
const { PATCH: patch, GET: get, POST: post } = api

function newClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(dealQuery(DEAL_ID).queryKey, deal)
  return client
}

function mount(client = newClient()) {
  return render(
    <QueryClientProvider client={client}>
      <Workspace dealId={DEAL_ID} />
    </QueryClientProvider>,
  )
}

function rentInput(): HTMLInputElement {
  const input = document.getElementById('in-operations-monthly_rent-input')
  if (!(input instanceof HTMLInputElement)) throw new Error('rent input missing')
  return input
}

function editRent(value: string) {
  const input = rentInput()
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

const withRent = (rent: number): DealDetail => ({
  ...deal,
  inputs: setPath(deal.inputs, 'operations.monthly_rent', rent),
})

function stubBrowser() {
  vi.useFakeTimers()
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
  patch.mockResolvedValue({ data: deal, response: ok() })
  get.mockResolvedValue({ data: deal, response: ok() })
  post.mockResolvedValue({ data: analysis, response: ok() })
}

function restoreBrowser() {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
}

// React only renders when act exits, so each timer needs its own act to see the next one set up.
async function pass(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
  }
}

function sentRent(call: number): number | undefined {
  const inputs = patch.mock.calls[call]?.[1].body.inputs
  return inputs && 'operations' in inputs ? inputs.operations.monthly_rent : undefined
}

describe('Workspace autosave', () => {
  beforeEach(stubBrowser)
  afterEach(restoreBrowser)

  it('sends an edit that is still waiting when the page is left', async () => {
    const view = mount()
    editRent('2500')
    await pass(300)
    expect(patch).not.toHaveBeenCalled()
    view.unmount()
    await pass(50)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(sentRent(0)).toBe(2500)
  })

  it('sends the edit with keepalive when the tab is closing', async () => {
    mount()
    editRent('2500')
    await pass(300)
    window.dispatchEvent(new Event('beforeunload'))
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch.mock.calls[0]?.[1]).toMatchObject({ keepalive: true })
    expect(sentRent(0)).toBe(2500)
  })

  it('says Unsaved from the moment of the edit until it is sent', async () => {
    mount()
    expect(screen.getByText('Saved')).toBeTruthy()
    editRent('2500')
    expect(screen.getByText('Unsaved')).toBeTruthy()
    await pass(300)
    expect(screen.getByText('Unsaved')).toBeTruthy()
    await pass(1000)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('says Saving while the request is out', async () => {
    let finish: (value: Result) => void = () => undefined
    patch.mockReturnValue(new Promise<Result>((resolve) => (finish = resolve)))
    mount()
    editRent('2500')
    await pass(1100)
    expect(screen.getByText('Saving')).toBeTruthy()
    act(() => finish({ data: deal, response: ok() }))
    await pass(50)
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('does not send again on the way out once the edit is saved', async () => {
    const view = mount()
    editRent('2500')
    await pass(1100)
    expect(patch).toHaveBeenCalledTimes(1)
    view.unmount()
    await pass(50)
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when nothing was edited', async () => {
    const view = mount()
    window.dispatchEvent(new Event('beforeunload'))
    view.unmount()
    await pass(50)
    expect(patch).not.toHaveBeenCalled()
  })
})

describe('Workspace and what the server has', () => {
  beforeEach(stubBrowser)
  afterEach(restoreBrowser)

  it('fetches the deal again after a save sent on the way out', async () => {
    get.mockResolvedValue({ data: withRent(2500), response: ok() })
    const client = newClient()
    const view = mount(client)
    editRent('2500')
    await pass(300)
    view.unmount()
    await pass(200)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/v1/deals/{deal_id}', expect.anything())
    mount(client)
    expect(rentInput().value).toBe('$2,500/mo')
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('adopts a change that lands after the page opened', async () => {
    const client = newClient()
    mount(client)
    expect(rentInput().value).toBe('$2,350/mo')
    act(() => {
      client.setQueryData(dealQuery(DEAL_ID).queryKey, withRent(2500))
    })
    await pass(50)
    expect(rentInput().value).toBe('$2,500/mo')
    expect(screen.getByText('Saved')).toBeTruthy()
    await pass(1100)
    expect(patch).not.toHaveBeenCalled()
  })

  it('keeps an edit in progress over a change from the server', async () => {
    const client = newClient()
    mount(client)
    editRent('2600')
    act(() => {
      client.setQueryData(dealQuery(DEAL_ID).queryKey, withRent(2500))
    })
    await pass(50)
    expect(rentInput().value).toBe('$2,600/mo')
    await pass(1100)
    expect(sentRent(0)).toBe(2600)
  })
})
