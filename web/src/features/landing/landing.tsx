import { useEffect, useRef } from 'react'

import { money, percent } from '../../lib/format'
import { useMedia } from '../../lib/use-media'
import { LinkButton } from '../../ui/button'
import { Card } from '../../ui/card'
import { Check, Chevron, Warn } from '../../ui/check'
import { Trace } from '../../ui/trace'
import { PublicNav } from '../shell/nav'
import styles from './landing.module.css'
import { deals, sample } from './sample'

const TRACE = sample.sources.slice(0, 3).map((s) => ({ from: 'sample-cash', to: `src-${s.id}` }))

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
  const dark = document.documentElement.dataset.theme !== 'light'
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
        ctx.fillStyle = `rgba(124, 156, 255, ${d.a * 0.6})`
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

/* The three figures below are the product's own controls, drawn still. */

function AddressFigure() {
  return (
    <div className={styles.figure} aria-hidden="true">
      <div className={styles.field}>1420 N 14th St, Sheboygan, WI</div>
      <ul className={styles.suggest}>
        <li>
          <span>Rent</span>
          <b>$2,350 a month</b>
          <small>RentCast</small>
        </li>
        <li>
          <span>Property tax</span>
          <b>$3,900 a year</b>
          <small>Census ACS</small>
        </li>
        <li>
          <span>Loan rate</span>
          <b>6.75%</b>
          <small>Freddie Mac</small>
        </li>
      </ul>
    </div>
  )
}

function StrategyFigure() {
  const options = [
    ['Rental', 'Buy it, rent it, hold it.'],
    ['BRRRR', 'Fix it, rent it, refinance your cash back out.'],
    ['Flip', 'Fix it and sell it inside a year.'],
    ['Wholesale', 'Assign the contract for a fee.'],
    ['Creative finance', 'Take over the seller’s loan.'],
  ]
  return (
    <div className={`${styles.figure} ${styles.picker}`} aria-hidden="true">
      {options.map(([name, line], i) => (
        <div key={name} className={`${styles.option} ${i === 0 ? styles.checked : ''}`}>
          <b>{name}</b>
          <span>{line}</span>
        </div>
      ))}
    </div>
  )
}

function InspectorFigure() {
  const rows = [
    ['Rent', 'RentCast rent estimate', '$2,350 a month', true],
    ['Down payment', 'Typical for a rental', '25%', false],
    ['Loan rate', 'Freddie Mac average plus 0.5%', '6.75%', true],
    ['Empty', 'Share of the year with no tenant', '5%', false],
  ] as const
  return (
    <div className={`${styles.figure} ${styles.rows}`} aria-hidden="true">
      {rows.map(([label, source, value, lit]) => (
        <div key={label} className={`${styles.inRow} ${lit ? styles.lit : ''}`}>
          <div>
            {label}
            <small>{source}</small>
          </div>
          <b>{value}</b>
        </div>
      ))}
    </div>
  )
}

const MOVES: { title: string; body: string; figure: () => React.JSX.Element }[] = [
  {
    title: 'Paste an address.',
    body: 'Parcel looks up the property and suggests the rent, the taxes and a loan rate, each with its source attached. Nothing is quietly set to zero.',
    figure: AddressFigure,
  },
  {
    title: 'Say what you would do.',
    body: 'Rent it, fix it and flip it, refinance it, assign the contract, or take over the loan. One month by month model handles all five, so they compare fairly.',
    figure: StrategyFigure,
  },
  {
    title: 'Change anything.',
    body: 'Tap a number in the answer and Parcel draws a line to the inputs it depends on. Edit one and the whole page moves with it, as you type.',
    figure: InspectorFigure,
  },
]

export function Landing() {
  const cardRef = useRef<HTMLDivElement>(null)
  const wide = useMedia('(min-width: 900px)')
  return (
    <>
      <Sea />
      <PublicNav />
      <main className={styles.main}>
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
              See how it works <Chevron />
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
              <em id="sample-cash" className={styles.lit}>
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
          <h2>Three moves, a few minutes.</h2>
          <div className={styles.moves}>
            {MOVES.map(({ title, body, figure: Figure }) => (
              <div key={title} className={styles.move}>
                <div className={styles.moveText}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <Figure />
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} id="strategies">
          <h2>Five ways to do a deal, five real answers.</h2>
          <p className={styles.lead}>
            The demo&rsquo;s sample deals, one per strategy, each run through the same model.
          </p>
          <ul className={styles.answers}>
            {deals.map((deal) => (
              <li key={deal.name} className={styles.deal}>
                <div className={styles.dealName}>
                  <b>{deal.strategy}</b>
                  <span>
                    {deal.name}
                    <br />
                    {deal.where}, Sheboygan
                  </span>
                </div>
                <div>
                  <div
                    className={`${styles.verdict} ${deal.answer === 'catch' ? styles.catch : ''}`}
                  >
                    {deal.answer === 'yes' ? <Check /> : <Warn />}
                    {deal.answer === 'yes' ? 'Yes, it works' : 'It works, with a catch'}
                  </div>
                  <p className={styles.sentence}>
                    {deal.parts.map((part, i) =>
                      part.lit ? (
                        <em key={i} className={styles.lit}>
                          {part.text}
                        </em>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </p>
                  <p className={styles.watch}>
                    <b>Watch out:</b> {deal.watch}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Honest by design.</h2>
          <ul className={styles.promises}>
            {PROMISES.map(([title, body]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.closing}>
          <p>Five sample deals, no account, nothing to install.</p>
          <LinkButton to="/demo" look="primary" size="large">
            Open the demo
          </LinkButton>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Parcel</span>
        <a href="/methodology">Methodology</a>
        <a href="https://github.com/ivan-711/parcel">Source</a>
        <span className={styles.footNote}>
          Sample figures come from the demo deals. Nothing here is advice.
        </span>
      </footer>
    </>
  )
}
