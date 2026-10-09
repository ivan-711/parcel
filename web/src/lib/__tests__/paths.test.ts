import { describe, expect, it } from 'vitest'

import { getPath, setPath } from '../paths'
import { duplex } from './fixtures'

describe('paths', () => {
  it('reads nested values by dotted path', () => {
    expect(getPath(duplex, 'price')).toBe(218_000)
    expect(getPath(duplex, 'operations.monthly_rent')).toBe(2_350)
    expect(getPath(duplex, 'operations.missing')).toBeUndefined()
    expect(getPath(duplex, 'price.deeper')).toBeUndefined()
  })

  it('writes without touching the original', () => {
    const next = setPath(duplex, 'operations.monthly_rent', 2_800)
    expect(getPath(next, 'operations.monthly_rent')).toBe(2_800)
    expect(getPath(duplex, 'operations.monthly_rent')).toBe(2_350)
    expect(next.strategy).toBe('buy_and_hold')
  })
})
