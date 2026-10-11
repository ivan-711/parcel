import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShareButton } from '../share'

interface Result {
  data?: unknown
  error?: unknown
  response: Response
}
type Call = (path: string) => Promise<Result>

const api = vi.hoisted(() => ({
  POST: vi.fn<Call>(),
  DELETE: vi.fn<Call>(),
}))

vi.mock('../../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/client')>()),
  api,
}))

const DEAL_ID = '6f1c5a8e-2d1b-4c4e-9a43-0a6f6a9c1b11'

const failure = (status: number): Result => ({
  error: { code: 'unavailable', title: 'Try again later', status },
  response: new Response(null, { status }),
})

async function openPopover() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ShareButton dealId={DEAL_ID} shared />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Shared' }))
  await screen.findByLabelText('Share link')
}

describe('ShareButton', () => {
  beforeEach(() => {
    api.POST.mockResolvedValue({
      data: { token: 'tok_abc' },
      response: new Response(null, { status: 200 }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the link open and says so when stopping fails', async () => {
    api.DELETE.mockResolvedValue(failure(500))
    await openPopover()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/couldn.t stop sharing/i)
    expect(screen.getByLabelText('Share link')).toBeTruthy()
  })

  it('closes the popover when the server answers 204', async () => {
    api.DELETE.mockResolvedValue({ data: undefined, response: new Response(null, { status: 204 }) })
    await openPopover()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(screen.queryByLabelText('Share link')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lets a second try go through after a failure', async () => {
    api.DELETE.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce({
      data: undefined,
      response: new Response(null, { status: 204 }),
    })
    await openPopover()
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(screen.queryByLabelText('Share link')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
