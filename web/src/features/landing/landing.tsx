import { useEffect, useRef } from 'react'

import { money, percent } from '../../lib/format'
import { useMedia } from '../../lib/use-media'
import { LinkButton } from '../../ui/button'
import { Card } from '../../ui/card'
import { Check } from '../../ui/check'
import { Trace } from '../../ui/trace'
import { PublicNav } from '../shell/nav'
import styles from './landing.module.css'
import { sample } from './sample'

const TRACE = sample.sources.slice(0, 3).map((s) => ({ from: 'sample-cash', to: `src-${s.id}` }))

const STEPS = [
  {
    title: 'Paste an address',
    body: 'Parcel looks up the property and suggests rent, taxes and a loan rate, each with its source attached.',
  },
  {
    title: 'Say what you would do',
    body: 'Rent it, fix it and flip it, refinance it, assign the contract, or take over the loan. One model handles all five.',
  },
  {
    title: 'Get a plain answer',
    body: 'A sentence, not a spreadsheet. Tap any number to see where it came from and what would change it.',
  },
]

const STRATEGIES = [
  ['Rental', 'Buy it, rent it, hold it.'],
  ['BRRRR', 'Fix it, rent it, refinance your cash back out.'],
  ['Flip', 'Fix it and sell it inside a year.'],
  ['Wholesale', 'Put it under contract and assign it for a fee.'],
  ['Creative finance', 'Take over the seller’s loan, with a note for the rest.'],
]

const PROMISES = [
  [
    'Every number has a source',
    'Rent from RentCast, taxes from the Census, rates from Freddie Mac, or a labeled estimate. Never a silent zero.',
  ],
  [
    'Risk sits next to return',
    'Thin coverage, a loan that costs more than the property earns, a balloon payment: flagged in plain words right under the answer.',
  ],
  [
    'The memo can’t make things up',
    'The written summary is checked against the engine’s figures before you see it, and flagged if a number doesn’t match.',
  ],
]

/** A sparse field of dim particles behind the answer card, only in the dark appearance. */
function Sea() {
  const ref = useRef<HTMLCanvasElement>(null)
  const dark = useMedia('(prefers-color-scheme: dark)')
  const still = useMedia('(prefers-reduced-motion: reduce)')
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !dark) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const dots = Array.from({ length: 220 }, () => ({
      x: rnd(),
      y: rnd(),
      r: rnd() * 1.2 + 0.3,
      a: rnd() * 0.5 + 0.1,
      v: rnd() * 0.00004 + 0.00001,
    }))
    let frame = 0
    let t = 0
    const draw = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        const y = (((d.y - t * d.v) % 1) + 1) % 1
        ctx.fillStyle = `rgba(61, 139, 255, ${d.a})`
        ctx.beginPath()
        ctx.arc(d.x * w, y * h, d.r, 0, 7)
        ctx.fill()
      }
      if (!still) {
        t += 1
        frame = requestAnimationFrame(draw)
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [dark, still])
  if (!dark) return null
  return <canvas ref={ref} className={styles.sea} aria-hidden="true" />
}

export function Landing() {
  const cardRef = useRef<HTMLDivElement>(null)
  const wide = useMedia('(min-width: 900px)')
  return (
    <>
      <Sea />
      <PublicNav />
      <main>
        <section className={styles.hero}>
          <h1 className={styles.h1}>Know if a property makes money.</h1>
          <p className={styles.sub}>
            Parcel turns an address into a plain answer, and shows you where every number came from.
          </p>
          <div className={styles.ctas}>
            <LinkButton to="/demo" look="primary" size="large">
              Open the demo
            </LinkButton>
            <a href="#how" className={styles.more}>
              See how it works ›
            </a>
          </div>
        </section>

        <div className={styles.cardWrap} ref={cardRef}>
          <Card className={styles.card} padded={false} as="article" aria-label="Sample deal">
            <div className={styles.row}>
              <b>{sample.address}</b> {sample.kind}
              <span className={styles.tag}>Sample deal</span>
            </div>
            <div className={styles.ok}>
              <Check /> Yes, it works
            </div>
            <p className={styles.answer}>
              <em id="sample-cash" className={styles.lit} style={{ fontStyle: 'normal' }}>
                {money(sample.cashFlowMonthly)} a month
              </em>{' '}
              in your pocket from a {money(sample.price)} duplex. Your money grows{' '}
              <span className={styles.lit}>{percent(sample.irr)} a year</span> on{' '}
              <span className={styles.lit}>{money(sample.cashToClose)}</span> down.
            </p>
            <p className={styles.watch}>
              <b>Watch out:</b> it needs to be rented {percent(sample.breakEven, 0)} of the time to
              cover its costs.
            </p>
            <div className={styles.tiles}>
              {sample.sources.map((s, i) => (
                <div
                  key={s.id}
                  id={`src-${s.id}`}
                  className={`${styles.tile} ${i < 3 ? styles.on : ''}`}
                >
                  <small>{s.label}</small>
                  <b>{s.value}</b>
                  {s.from}
                </div>
              ))}
            </div>
          </Card>
          {wide && <Trace container={cardRef} links={TRACE} gutter={28} mode="margin" />}
        </div>

        <section className={styles.section} id="how">
          <h2>Three steps, a few minutes.</h2>
          <p>Built for people with a handful of properties, not a spreadsheet habit.</p>
          <div className={styles.steps}>
            {STEPS.map((step, i) => (
              <Card key={step.title} className={styles.step}>
                <span className={styles.n}>{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className={styles.section} id="strategies">
          <h2>Five ways to do a deal.</h2>
          <p>
            Each one runs through the same month by month model, so they read the same way and
            compare fairly.
          </p>
          <Card className={styles.list} as="div">
            {STRATEGIES.map(([name, line]) => (
              <div key={name} className={styles.item}>
                <h3>{name}</h3>
                <p>{line}</p>
              </div>
            ))}
          </Card>
        </section>

        <section className={styles.section}>
          <h2>Honest by design.</h2>
          <Card className={styles.promises} as="div">
            {PROMISES.map(([title, body]) => (
              <div key={title} className={styles.item}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </Card>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Parcel</span>
        <a href="/methodology">Methodology</a>
        <a href="https://github.com/ivan-711/parcel">Source</a>
        <span style={{ marginLeft: 'auto' }}>
          Sample figures come from the demo deal. Nothing here is advice.
        </span>
      </footer>
    </>
  )
}
