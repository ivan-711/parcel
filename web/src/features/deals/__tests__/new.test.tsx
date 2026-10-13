import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LookupResult, Me } from '../../../lib/api/queries'
import { NewDeal } from '../new'

interface Result {
  data?: unknown
  response: Response
}
interface Init {
  body?: { inputs?: Record<string, unknown>; provenance?: Record<string, { label: string }> }
}
type Call = (path: string, init?: Init) => Promise<Result>

const api = vi.hoisted(() => ({ GET: vi.fn<Call>(), POST: vi.fn<Call>() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  api,
}))

const me: Me = {
  id: 'u1',
  email: null,
  name: null,
  plan: 'free',
  is_demo: false,
  demo_expires_at: null,
  defaults: {},
}

const rentcast = { kind: 'rentcast', label: 'RentCast', as_of: null } as const

const lookup: LookupResult = {
  address: {
    line1: '12 Main St',
    city: 'Naples',
    state: 'FL',
    zip: '34102',
    county: null,
    latitude: null,
    longitude: null,
  },
  facts: {
    property_type: null,
    bedrooms: null,
    bathrooms: null,
    square_feet: null,
    year_built: null,
    last_sale_price: null,
    last_sale_date: null,
  },
  suggestions: {
    'operations.property_tax_annual': { value: 4_200, source: rentcast },
    'operations.insurance_annual': { value: 1_500, source: rentcast },
  },
  rent_comparables: [],
  sale_comparables: [],
  notes: [],
}

const reply = (data: unknown): Promise<Result> =>
  Promise.resolve({ data, response: new Response(null, { status: 200 }) })

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NewDeal />
    </QueryClientProvider>,
  )
  return client
}

function skipLookup(strategy: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /Skip the lookup/ }))
  fireEvent.click(screen.getByRole('radio', { name: strategy }))
}

function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}

function submit() {
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'See if it works' })
  fireEvent.click(button)
}

async function created() {
  await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/v1/deals', expect.anything()))
  const call = api.POST.mock.calls.find(([path]) => path === '/v1/deals')
  const body = call?.[1]?.body
  if (!body?.inputs || !body.provenance) throw new Error('no deal was sent')
  return { inputs: body.inputs, provenance: body.provenance }
}

describe('NewDeal', () => {
  beforeEach(() => {
    api.GET.mockImplementation((path) => reply(path === '/v1/me' ? me : []))
    api.POST.mockImplementation((path) => reply(path === '/v1/lookup' ? lookup : { id: 'd1' }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('asks for every number that has not been entered', () => {
    mount()
    skipLookup(/^Flip/)
    fill({ 'Call it': 'Flip on Oak' })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'See if it works' }).disabled,
    ).toBe(true)
    expect(screen.getByText(/Still need price, repairs, resale price/)).toBeTruthy()
  })

  it('takes a real 0 for repairs on a flip', async () => {
    mount()
    skipLookup(/^Flip/)
    fill({
      Price: '100000',
      Repairs: '0',
      'Resale price': '150000',
      'Property tax': '1200',
      Insurance: '800',
      'Call it': 'Flip on Oak',
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'See if it works' }).disabled,
    ).toBe(false)
    submit()
    expect((await created()).inputs.rehab_cost).toBe(0)
  })

  it('marks the deal list out of date once the deal is made', async () => {
    const client = mount()
    client.setQueryData(['deals'], [])
    skipLookup(/^Flip/)
    fill({
      Price: '100000',
      Repairs: '5000',
      'Resale price': '150000',
      'Property tax': '1200',
      Insurance: '800',
      'Call it': 'Flip on Oak',
    })
    submit()
    await created()
    await waitFor(() => expect(client.getQueryState(['deals'])?.isInvalidated).toBe(true))
  })

  it('shows the 0 that was entered', () => {
    mount()
    skipLookup(/^Flip/)
    const repairs = screen.getByLabelText<HTMLInputElement>('Repairs')
    fireEvent.change(repairs, { target: { value: '0' } })
    fireEvent.blur(repairs)
    expect(repairs.value).toBe('0')
  })

  it('takes 0 for their loan balance and rate on a creative deal', async () => {
    mount()
    skipLookup(/^Creative/)
    fill({
      Price: '200000',
      'Rent a month': '1800',
      'Property tax': '2400',
      Insurance: '1200',
      'Their loan balance': '0',
      'Their rate (%)': '0',
      'Months left on it (months)': '120',
      'Call it': 'Sub to on Elm',
    })
    submit()
    const { inputs } = await created()
    expect(inputs.existing_balance).toBe(0)
    expect(inputs.existing_rate).toBe(0)
  })

  it('asks for the months left on their loan rather than assuming one', () => {
    mount()
    skipLookup(/^Creative/)
    fill({
      Price: '200000',
      'Rent a month': '1800',
      'Property tax': '2400',
      Insurance: '1200',
      'Their loan balance': '90000',
      'Their rate (%)': '4',
      'Call it': 'Sub to on Elm',
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'See if it works' }).disabled,
    ).toBe(true)
    expect(screen.getByText(/Still need months left on it/)).toBeTruthy()
  })

  it('still asks for months left when 0 is typed, since the API needs at least 1', () => {
    mount()
    skipLookup(/^Creative/)
    fill({
      Price: '200000',
      'Rent a month': '1800',
      'Property tax': '2400',
      Insurance: '1200',
      'Their loan balance': '90000',
      'Their rate (%)': '4',
      'Months left on it (months)': '0',
      'Call it': 'Sub to on Elm',
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'See if it works' }).disabled,
    ).toBe(true)
    expect(screen.getByText(/Still need months left on it/)).toBeTruthy()
  })

  it('keeps a 0 the user typed over what the lookup suggests', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Property address'), {
      target: { value: '12 Main St, Naples, FL' },
    })
    fireEvent.keyDown(screen.getByLabelText('Property address'), { key: 'Enter' })
    await screen.findByText(/Naples/)
    fireEvent.click(screen.getByRole('radio', { name: /^Flip/ }))
    fill({ Price: '100000', Repairs: '5000', 'Resale price': '150000', 'Property tax': '0' })
    submit()
    const { inputs, provenance } = await created()
    expect(inputs.property_tax_annual).toBe(0)
    expect(provenance.property_tax_annual?.label).toBe('Your number')
  })

  it('still uses the suggestion for a number the user left alone', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Property address'), {
      target: { value: '12 Main St, Naples, FL' },
    })
    fireEvent.keyDown(screen.getByLabelText('Property address'), { key: 'Enter' })
    await screen.findByText(/Naples/)
    fireEvent.click(screen.getByRole('radio', { name: /^Flip/ }))
    fill({ Price: '100000', Repairs: '5000', 'Resale price': '150000' })
    submit()
    const { inputs, provenance } = await created()
    expect(inputs.property_tax_annual).toBe(4_200)
    expect(inputs.insurance_annual).toBe(1_500)
    expect(provenance.insurance_annual?.label).toBe('RentCast')
  })
})
