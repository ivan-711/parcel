import { Card } from '../../../ui/card'
import { Check, Warn } from '../../../ui/check'
import type { Verdict } from '../../../lib/words'
import styles from './workspace.module.css'

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <Card className={styles.verdict} padded={false} aria-live="polite">
      <div className={`${styles.ok} ${verdict.answer !== 'yes' ? styles[verdict.answer] : ''}`}>
        {verdict.answer === 'yes' ? <Check /> : <Warn />} {verdict.headline}
      </div>
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
          <b>Watch out:</b> {verdict.watch}
        </p>
      )}
    </Card>
  )
}
