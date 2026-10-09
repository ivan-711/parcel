import type { HTMLAttributes, ReactNode } from 'react'

import styles from './card.module.css'

interface CardProps extends HTMLAttributes<HTMLElement> {
  padded?: boolean
  as?: 'div' | 'section' | 'article'
}

export function Card({ padded = true, as: Tag = 'section', className, ...rest }: CardProps) {
  const cls = [styles.card, padded && styles.padded, className].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest} />
}

export function CardTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header>
      <h2 className={styles.title}>{children}</h2>
      {sub && <p className={styles.subtitle}>{sub}</p>}
    </header>
  )
}
