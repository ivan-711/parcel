import { clerk } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

// Specs that write data get their own user so they can't trip over each other.
const accounts = {
  primary: 'E2E_EMAIL',
  workspace: 'E2E_EMAIL_2',
  pipeline: 'E2E_EMAIL_3',
} as const

/**
 * Signs a test user in through Clerk's development instance. Clerk mints the
 * session server side, so no password or code is involved. It waits for Clerk
 * to load on its own, and looks the user up by email, so an unset variable
 * has to fail here rather than match whichever user Clerk lists first.
 */
export async function signIn(page: Page, account: keyof typeof accounts = 'primary') {
  const emailAddress = process.env[accounts[account]]
  if (!emailAddress) throw new Error(`${accounts[account]} is not set`)
  await page.goto('/')
  await clerk.signIn({ page, emailAddress })
}
