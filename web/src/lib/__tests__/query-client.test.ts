import { beforeEach, describe, expect, it } from 'vitest'

import { queryClient } from '../api/query-client'
import { session } from '../session'

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString()

describe('query client', () => {
  beforeEach(() => {
    session.endDemo()
    queryClient.clear()
  })

  it('drops what the last demo cached when a new one starts', () => {
    queryClient.setQueryData(['deals'], [{ id: 'from-the-last-demo' }])
    session.startDemo('tok_b', tomorrow())
    expect(queryClient.getQueryData(['deals'])).toBeUndefined()
  })

  it('keeps cached data while nobody changes', () => {
    session.startDemo('tok_a', tomorrow())
    queryClient.setQueryData(['me'], { id: 'demo' })
    expect(queryClient.getQueryData(['me'])).toEqual({ id: 'demo' })
  })
})
