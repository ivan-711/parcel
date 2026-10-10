import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

/**
 * Signs a test user in through Clerk's development instance. The user is
 * identified by E2E_EMAIL; Clerk mints the session server side, so no
 * password or code is involved.
 */
export async function signIn(page: Page, emailAddress = process.env.E2E_EMAIL ?? '') {
  await setupClerkTestingToken({ page })
  await page.goto('/')
  await page.waitForFunction(() =>
    Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
  )
  await clerk.signIn({ page, emailAddress })
}
