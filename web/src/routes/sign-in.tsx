import { SignIn } from '@clerk/react'
import { createFileRoute } from '@tanstack/react-router'

import { PublicNav } from '../features/shell/nav'
import styles from '../features/shell/shell.module.css'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

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
