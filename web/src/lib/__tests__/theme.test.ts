import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ThemeModule = typeof import('../theme').theme

let light = false
const listeners = new Set<() => void>()

function installMatchMedia() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('light') ? light : !light,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia
}

describe('theme', () => {
  let theme: ThemeModule

  beforeEach(async () => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    listeners.clear()
    light = false
    installMatchMedia()
    vi.resetModules()
    ;({ theme } = await import('../theme'))
  })

  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('follows the system appearance when nothing is saved', () => {
    light = true
    theme.init()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(theme.current()).toBe('light')
  })

  it('keeps following the system until a choice is made', () => {
    theme.init()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    light = true
    listeners.forEach((fn) => fn())
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('a saved choice beats the system', () => {
    light = true
    theme.set('dark')
    theme.init()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    listeners.forEach((fn) => fn())
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('a light choice from before still counts', () => {
    localStorage.setItem('parcel.theme', 'light')
    theme.init()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
