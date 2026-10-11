import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Entry } from '../portfolio'

type Body = Record<string, number | string>
const put = vi.fn<(path: string, options: { body: Body }) => Promise<unknown>>(() =>
  Promise.resolve({ data: {}, response: new Response() }),
)

vi.mock('../../../lib/api/client', () => ({
  api: { PUT: (path: string, options: { body: Body }) => put(path, options) },
  unwrap: (result: { data: unknown }) => result.data,
}))

afterEach(() => {
  cleanup()
  put.mockClear()
})

function sent(): Body | undefined {
  return put.mock.calls[0]?.[1].body
}

const recorded = {
  rent_collected: 2000,
  operating_expenses: 500,
  debt_service: 1000,
  capital_spent: 0,
  note: 'roof leak',
}

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Entry dealId="d1" month="2026-08-01" recorded={recorded} onDone={() => undefined} />
    </QueryClientProvider>,
  )
}

describe('Entry', () => {
  it('starts from what was recorded and changes only the edited field', async () => {
    mount()
    expect(screen.getByLabelText('Rent collected')).toHaveProperty('value', '2000')
    expect(screen.getByLabelText('Loan payment')).toHaveProperty('value', '1000')
    fireEvent.change(screen.getByLabelText('Operating costs'), { target: { value: '600' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(sent()).toEqual({ ...recorded, operating_expenses: 600 })
  })

  it('reads a typed comma as part of the number', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Rent collected'), { target: { value: '2,150' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(sent()?.rent_collected).toBe(2150)
  })
})
