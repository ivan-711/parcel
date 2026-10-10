import { SignIn } from '@clerk/react'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { accountsEnabled } from '../features/auth/provider'
import { PublicNav } from '../features/shell/nav'
import styles from '../features/shell/shell.module.css'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: () => {
    if (!accountsEnabled) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Sign in' }, { name: 'robots', content: 'noindex' }] }),
  component: SignInPage,
})

function SignInPage() {
  return (
    <>
      <PublicNav />
      <main className={styles.empty}>
        <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/deals" />
      </main>
    </>
  )
}
