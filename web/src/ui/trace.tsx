import { useEffect, useState, type RefObject } from 'react'

import styles from './trace.module.css'

export interface TraceLink {
  from: string
  to: string
}

type Point = [number, number]

interface Line {
  d: string
  length: number
  end: Point
}

function marginRoute(
  from: DOMRect,
  to: DOMRect,
  gutterX: number,
  lane: number,
  box: DOMRect,
): Line {
  const x = (v: number) => v - box.left
  const y = (v: number) => v - box.top
  const g = gutterX
  const fy = y(from.top + from.height * 0.55)
  const gapY = y(to.top) - 16 + lane * 4
  const tx = x(to.left) + 40
  const ty = y(to.top) - 1
  const r = 8
  const pts: Point[] = [
    [x(from.left) - 2, fy],
    [g + r, fy],
    [g, fy + r],
    [g, gapY - r],
    [g + r, gapY],
    [tx - r, gapY],
    [tx, gapY + r],
    [tx, ty],
  ]
  const d = pts
    .map((p, i) =>
      i === 0
        ? `M${p[0]} ${p[1]}`
        : i % 2 === 0
          ? `Q${i === 2 ? g : i === 4 ? g : tx} ${i === 2 ? fy : i === 4 ? gapY : gapY} ${p[0]} ${p[1]}`
          : `L${p[0]} ${p[1]}`,
    )
    .join(' ')
  const length =
    Math.abs(x(from.left) - g) +
    Math.abs(gapY - fy) +
    Math.abs(tx - g) +
    Math.abs(ty - gapY) +
    4 * r
  return { d, length, end: [tx, ty] }
}

function route(from: DOMRect, to: DOMRect, gutterX: number, lane: number, box: DOMRect): Line {
  const x = (v: number) => v - box.left
  const y = (v: number) => v - box.top
  const g = gutterX + lane * 0
  const fy = y(from.top + from.height / 2)
  const ty = y(to.top + to.height / 2)
  const dir = Math.sign(ty - fy) || 1
  const r = 8
  const pts: Point[] = [
    [x(from.right) + 2, fy],
    [g - r, fy],
    [g, fy + r * dir],
    [g, ty - r * dir],
    [g + r, ty],
    [x(to.left) - 1, ty],
  ]
  const [a, b, c, d2, e, f] = pts as [Point, Point, Point, Point, Point, Point]
  const d = `M${a[0]} ${a[1]} L${b[0]} ${b[1]} Q${g} ${fy} ${c[0]} ${c[1]} L${d2[0]} ${d2[1]} Q${g} ${ty} ${e[0]} ${e[1]} L${f[0]} ${f[1]}`
  const length = Math.abs(b[0] - a[0]) + Math.abs(d2[1] - c[1]) + Math.abs(f[0] - e[0]) + 4 * r
  return { d, length, end: f }
}

/**
 * Thin accent lines from one element to others, drawn in an overlay.
 *
 * Elements are found by id inside `container`. Lines leave the right edge of
 * `from`, share one trunk down the gutter and branch into the left edge of each
 * `to`, so they cross whitespace, never text. Re-measured on resize.
 */
export function Trace({
  container,
  links,
  gutter,
  mode = 'gutter',
}: {
  container: RefObject<HTMLElement | null>
  links: TraceLink[]
  /** Pixels from the container's left edge, or the id of an element to run just left of. */
  gutter: number | string
  mode?: 'gutter' | 'margin'
}) {
  const [lines, setLines] = useState<Line[]>([])

  // A passive effect, because the container ref is attached after a child's layout effect runs.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const anchor = typeof gutter === 'string' ? el.querySelector(`#${CSS.escape(gutter)}`) : null
      const gutterX =
        typeof gutter === 'number'
          ? gutter
          : anchor
            ? anchor.getBoundingClientRect().left - box.left - 10
            : 0
      const next: Line[] = []
      links.forEach((link, i) => {
        const from = el.querySelector<HTMLElement>(`#${CSS.escape(link.from)}`)
        const to = el.querySelector<HTMLElement>(`#${CSS.escape(link.to)}`)
        if (!from || !to) return
        const plan = mode === 'margin' ? marginRoute : route
        next.push(plan(from.getBoundingClientRect(), to.getBoundingClientRect(), gutterX, i, box))
      })
      setLines(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // A sticky panel moves its inputs without resizing the container.
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [container, links, gutter, mode])

  if (!lines.length) return null
  return (
    <svg className={styles.layer} aria-hidden="true">
      {lines.map((line, i) => (
        <g key={i}>
          <path
            className={styles.path}
            d={line.d}
            style={{ '--length': line.length } as React.CSSProperties}
          />
          <circle
            className={styles.dot}
            cx={line.end[0] + (mode === 'margin' ? 0 : 2)}
            cy={line.end[1]}
            r="3"
          />
        </g>
      ))}
    </svg>
  )
}
