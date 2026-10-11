import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { duplex } from '../../../../lib/__tests__/fixtures'
import type { HoldingInputs } from '../../../../lib/api/queries'
import { WhatIf } from '../whatif'

const post = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>())

vi.mock('../../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/client')>()),
  api: { POST: post },
}))

function refuseSimulation(status: number, code: string) {
  post.mockImplementation((path) => {
    const failed = path.endsWith('/simulate') ? { status, code } : { status: 500, code: 'internal' }
    const error = { code: failed.code, title: 'No', status: failed.status }
    return Promise.resolve({ error, response: { status: failed.status } })
  })
}

function runSimulation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <WhatIf inputs={duplex as HoldingInputs} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Run 10,000 versions' }))
}

describe('Monte Carlo panel', () => {
  afterEach(() => {
    cleanup()
    post.mockReset()
  })

  it('says the plan is the problem when the API refuses on plan', async () => {
    refuseSimulation(402, 'pro_required')
    runSimulation()
    expect(await screen.findByText(/This needs Pro/)).toBeTruthy()
  })

  it('does not blame the plan for a server failure', async () => {
    refuseSimulation(500, 'internal')
    runSimulation()
    expect(await screen.findByText(/Try again/)).toBeTruthy()
    expect(screen.queryByText(/needs Pro/)).toBeNull()
  })
})
