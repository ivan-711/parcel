import { LinkButton } from '../../ui/button'
import styles from './shell.module.css'

export function NotFound() {
  return (
    <main className={styles.empty}>
      <h1>There's nothing here.</h1>
      <p>The page may have moved, or the link was wrong.</p>
      <LinkButton to="/" look="primary">
        Back to the start
      </LinkButton>
    </main>
  )
}
