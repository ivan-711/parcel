import { SignUp } from '@clerk/react'
import { createFileRoute } from '@tanstack/react-router'

import { PublicNav } from '../features/shell/nav'
import styles from '../features/shell/shell.module.css'

export const Route = createFileRoute('/sign-up')({
  head: () => ({ meta: [{ title: 'Create an account' }, { name: 'robots', content: 'noindex' }] }),
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <>
      <PublicNav />
      <main className={styles.empty}>
        <SignUp routing="hash" signInUrl="/sign-in" forceRedirectUrl="/deals" />
      </main>
    </>
  )
}
