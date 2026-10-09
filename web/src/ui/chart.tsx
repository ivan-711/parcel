import { scaleLinear } from 'd3-scale'
import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { compact, moneySigned } from '../lib/format'
import styles from './chart.module.css'

export interface ChartPoint {
  x: number
  label: string
  value: number
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * One series over time with a zero baseline: where your money stands.
 *
 * First and last points are labeled; everything else lives in the hover tip.
 */
export function MoneyLine({
  points,
  height = 190,
  endLabel,
  startLabel,
}: {
  points: ChartPoint[]
  height?: number
  endLabel?: string
  startLabel?: string
}) {
  const [ref, width] = useWidth(520)
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 48, r: 12, t: 24, b: 26 }
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null

  const values = points.map((p) => p.value)
  const y = scaleLinear()
    .domain([Math.min(0, ...values), Math.max(0, ...values)])
    .nice(4)
    .range([height - pad.b, pad.t])
  const x = scaleLinear()
    .domain([first.x, last.x])
    .range([pad.l, width - pad.r])
  const ticks = y.ticks(4)
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${x(last.x).toFixed(1)} ${y(0).toFixed(1)} L${x(first.x).toFixed(1)} ${y(0).toFixed(1)} Z`
  // Enough x labels to read the span, never so many that neighbors touch.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(width / 110))))
  const xTicks = points.filter(
    (p, i) =>
      i === 0 ||
      i === points.length - 1 ||
      (i % every === 0 && i < points.length - every / 2 && p !== last),
  )

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.x) - px) < Math.abs(x(points[best]?.x ?? 0) - px)) best = i
    })
    setHover(best)
  }
  const hovered = hover === null ? null : points[hover]

  return (
    <div className={styles.wrap} ref={ref}>
      <svg
        className={styles.svg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Money over time, from ${moneySigned(first.value)} to ${moneySigned(last.value)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="money-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              className={t === 0 ? styles.zero : styles.grid}
              x1={pad.l}
              x2={width - pad.r}
              y1={y(t)}
              y2={y(t)}
            />
            <text className={styles.tick} x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {t === 0 ? '$0' : compact(t)}
            </text>
          </g>
        ))}
        {xTicks.map((p) => (
          <text
            key={p.x}
            className={styles.tick}
            x={x(p.x)}
            y={height - 8}
            textAnchor={p === first ? 'start' : p === last ? 'end' : 'middle'}
          >
            {p.label}
          </text>
        ))}
        <path className={styles.area} d={area} />
        <path className={styles.line} d={path} />
        {hovered && (
          <line
            className={styles.hover}
            x1={x(hovered.x)}
            x2={x(hovered.x)}
            y1={pad.t}
            y2={height - pad.b}
          />
        )}
        {[first, last].map((p) => (
          <circle key={p.x} className={styles.dot} cx={x(p.x)} cy={y(p.value)} r="3.5" />
        ))}
        {hovered && hovered !== first && hovered !== last && (
          <circle className={styles.dot} cx={x(hovered.x)} cy={y(hovered.value)} r="3.5" />
        )}
        <text className={styles.label} x={x(first.x) + 10} y={y(first.value) + 16}>
          {startLabel ?? moneySigned(first.value)}
        </text>
        <text className={styles.label} x={x(last.x) - 10} y={y(last.value) - 10} textAnchor="end">
          {endLabel ?? moneySigned(last.value)}
        </text>
      </svg>
      {hovered && (
        <div className={styles.tip} style={{ left: x(hovered.x), top: y(hovered.value) }}>
          {hovered.label}: <b>{moneySigned(hovered.value)}</b>
        </div>
      )}
    </div>
  )
}
