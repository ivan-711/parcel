import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

/** Fetches a Clerk testing token once so signed in specs can skip bot checks. */
setup('clerk', async () => {
  await clerkSetup({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  })
})
