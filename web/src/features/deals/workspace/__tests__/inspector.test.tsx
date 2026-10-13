import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { duplex } from '../../../../lib/__tests__/fixtures'
import { Inspector } from '../inspector'

const frames: FrameRequestCallback[] = []

function runFrames() {
  for (const frame of frames.splice(0)) frame(0)
}

function field(id: string) {
  const input = document.getElementById(`in-${id}-input`)
  if (!(input instanceof HTMLInputElement)) throw new Error(`no field ${id}`)
  return input
}

function focus(input: HTMLInputElement) {
  act(() => input.focus())
}

describe('assumption fields', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    render(
      <Inspector
        strategy="buy_and_hold"
        inputs={duplex}
        provenance={{}}
        lit={new Set()}
        showAll
        onChange={() => undefined}
      />,
    )
  })
  afterEach(() => {
    cleanup()
    frames.length = 0
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the raw number on focus and selects it once it has rendered', () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const price = field('price')
    expect(price).toHaveProperty('value', '$218,000')
    focus(price)
    expect(price).toHaveProperty('value', '218000')
    expect(select).not.toHaveBeenCalled()
    runFrames()
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.instances[0]).toBe(price)
  })

  it('leaves a field alone when focus moved on before its frame', () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const price = field('price')
    const rent = field('operations-monthly_rent')
    focus(price)
    focus(rent)
    runFrames()
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.instances[0]).toBe(rent)
    expect(document.activeElement).toBe(rent)
  })
})
