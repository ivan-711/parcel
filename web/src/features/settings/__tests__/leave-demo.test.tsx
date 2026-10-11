import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '../../../lib/api/query-client'
import type { Me } from '../../../lib/api/queries'
import { session } from '../../../lib/session'
import { routeTree } from '../../../routeTree.gen'

interface Result {
  data?: unknown
  error?: unknown
  response: Response
}

const api = vi.hoisted(() => ({
  GET: vi.fn<(path: string) => Promise<Result>>(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
}))

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  api,
}))

const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()

const me: Me = {
  id: 'demo-1',
  email: null,
  name: null,
  plan: 'pro',
  is_demo: true,
  demo_expires_at: hours(20),
  defaults: {},
}

describe('leaving the demo', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    window.scrollTo = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('sends nothing without a token on the way out', async () => {
    const tokenless: string[] = []
    api.GET.mockImplementation((path) => {
      if (session.demo() === null) {
        tokenless.push(path)
        return Promise.resolve({
          error: { code: 'unauthorized' },
          response: new Response(null, { status: 401 }),
        })
      }
      return Promise.resolve({
        data: path === '/v1/me' ? me : [],
        response: new Response(null, { status: 200 }),
      })
    })
    session.startDemo('tok_a', hours(24))
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ['/settings'] }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findAllByRole('button', { name: 'Leave the demo' })
    const [leave] = screen.getAllByRole('button', { name: 'Leave the demo' })
    if (!leave) throw new Error('no way to leave')
    fireEvent.click(leave)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(tokenless).toEqual([])
  })
})
