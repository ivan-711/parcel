/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Stylesheets are stubbed under the test runner, so the file is read as text.
const css = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8')

type Rgb = [number, number, number]

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const end = css.indexOf('\n}', start)
  const vars: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/gs)) {
    vars[m[1] ?? ''] = (m[2] ?? '').replace(/\s+/g, ' ').trim()
  }
  return vars
}

function token(vars: Record<string, string>, name: string): string {
  const value = vars[name]
  if (value === undefined) throw new Error(`no token --${name}`)
  return value
}

function parse(value: string): [Rgb, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1] ?? '0', 16)
    return [[n >> 16, (n >> 8) & 255, n & 255], 1]
  }
  const rgba = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value)
  if (!rgba) throw new Error(`cannot parse ${value}`)
  const [, r = '0', g = '0', b = '0', a] = rgba
  return [[Number(r), Number(g), Number(b)], a === undefined ? 1 : Number(a)]
}

function over(top: string, under: Rgb): Rgb {
  const [c, a] = parse(top)
  return [0, 1, 2].map((i) => (c[i] ?? 0) * a + (under[i] ?? 0) * (1 - a)) as Rgb
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function stops(gradient: string): string[] {
  return [...gradient.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0])
}

const TEXT = ['text', 'sub', 'mute', 'accent', 'good', 'caution', 'risk']
const SURFACES = ['bg', 'card', 'card2', 'tile', 'well']

describe.each([
  ['dark', ':root'],
  ['light', ":root[data-theme='light']"],
])('%s appearance', (_, selector) => {
  const t = block(selector)
  const bg = parse(token(t, 'bg'))[0]
  const surface = (name: string) => over(token(t, name), bg)

  it.each(TEXT.flatMap((fg) => SURFACES.map((s) => [fg, s])))(
    'reads %s on %s at 4.5:1 or better',
    (fg, s) => {
      expect(ratio(over(token(t, fg), surface(s)), surface(s))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(['good', 'caution', 'risk', 'accent'])('reads %s on its soft tint', (name) => {
    const tint = over(token(t, `${name}-soft`), surface('card'))
    expect(ratio(over(token(t, name), tint), tint)).toBeGreaterThanOrEqual(4.5)
  })

  it('reads the primary button label on every stop of its gradient', () => {
    const ink = parse(token(t, 'accent-ink'))[0]
    for (const stop of stops(token(t, 'primary-bg'))) {
      expect(ratio(ink, parse(stop)[0]), stop).toBeGreaterThanOrEqual(4.5)
    }
  })
})
