import type { ReactNode } from 'react'

import { Check, Warn } from '../../../ui/check'
import type { Verdict } from '../../../lib/words'
import styles from './workspace.module.css'

/** The status band at the top of the answer card: pill, sentence, watch line. */
export function VerdictBand({ verdict, children }: { verdict: Verdict; children?: ReactNode }) {
  const tone = verdict.answer !== 'yes' ? styles[verdict.answer] : ''
  return (
    <div className={`${styles.band} ${tone}`} aria-live="polite">
      <span className={`${styles.status} ${tone}`}>
        {verdict.answer === 'yes' ? <Check /> : <Warn />} {verdict.headline}
      </span>
      <p className={styles.answer}>
        {verdict.parts.map((part, i) =>
          part.lit ? (
            <em key={i} className={styles.lit}>
              {part.text}
            </em>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {verdict.watch && (
        <p className={styles.watch}>
          <Warn />
          <span>
            <b>Watch out.</b> {verdict.watch.charAt(0).toUpperCase() + verdict.watch.slice(1)}
          </span>
        </p>
      )}
      {children}
    </div>
  )
}
