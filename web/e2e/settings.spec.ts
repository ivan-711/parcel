import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { signIn } from './account'

// Clerk's own footer badge is theirs to fix, so the check skips it.
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.cl-footer')
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

async function noCrash(page: Page) {
  await expect(page.getByText('Something went wrong!')).toHaveCount(0)
}

test('settings changes stick and become the default for a new deal', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

  await page.getByLabel('Shown on shared reports').fill('Casey Tester')
  await page.getByLabel('Down payment').fill('18')
  await page.getByLabel('Loan rate').fill('6.25')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Shown on shared reports')).toHaveValue('Casey Tester')
  await expect(page.getByLabel('Down payment')).toHaveValue('18')
  await expect(page.getByLabel('Loan rate')).toHaveValue('6.25')

  await page.getByRole('link', { name: 'Deals' }).first().click()
  await page.getByRole('link', { name: 'New deal' }).click()
  await page.getByLabel('Property address').fill('2210 Kohler')
  await page.getByRole('option').first().click()
  await expect(page.getByText('2210 Kohler Ave, Sheboygan, WI')).toBeVisible()
  await page.getByRole('radio', { name: /Buy and hold|Rental/ }).click()
  await page.getByLabel('Call it').fill('Settings default check')
  await page.getByRole('button', { name: 'See if it works' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings default check')
  await expect(page.locator('#in-down_payment_rate-input')).toHaveValue('18%')
})

test('billing shows the free plan and either starts checkout or says why not', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()
  await expect(page.getByText('Free', { exact: true })).toBeVisible()

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/v1/billing/checkout')),
    page.getByRole('button', { name: 'Try Pro' }).click(),
  ])
  if (response.status() === 503) {
    // The one refusal the message is written for. Any other failure is a real one.
    expect(((await response.json()) as { code?: string }).code).toBe('billing_off')
    await expect(page.getByText(/Billing isn.t set up on this server/)).toBeVisible()
  } else {
    expect(response.ok()).toBe(true)
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20_000 })
    await page.goBack()
    await expect(page).toHaveURL(/\/settings/)
  }
  await noCrash(page)
})

test('signing out lands on the landing page and closes the app', async ({ page }) => {
  await signIn(page)
  await page.goto('/deals')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deals')

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Sign out' })
    .click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Know if a property makes money.',
  )

  await page.goto('/deals')
  await expect(page).toHaveURL(/\/sign-in/)
  await noCrash(page)
})

test('a signed in user who opens the demo stays themselves', async ({ page }) => {
  await signIn(page)
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/deals$/)
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByText('Demo', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Sign out' }),
  ).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('parcel.demo'))).toBeNull()

  await page.goto('/settings')
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Sign out' }),
  ).toBeVisible()
  await expect(page.getByText('A demo sandbox.')).toHaveCount(0)
})

test('a stale demo token does not override a signed in user', async ({ page }) => {
  await signIn(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'parcel.demo',
      JSON.stringify({ token: 'stale', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    ),
  )
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Sign out' }),
  ).toBeVisible()
  await noCrash(page)
})

for (const path of ['/sign-in', '/sign-up']) {
  test(`a signed in user opening ${path} goes into the app`, async ({ page }) => {
    await signIn(page)
    await page.goto(path)
    await expect(page).toHaveURL(/\/deals$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deals')
  })
}

test('a deal that is missing or belongs to someone else reads as not found', async ({
  page,
  browser,
}) => {
  // Somebody else's real deal, made in its own browser so the two sessions never mix.
  const other = await browser.newContext()
  const theirs = await other.newPage()
  await signIn(theirs, 'workspace')
  await theirs.goto('/deals/new')
  await theirs.getByLabel('Property address').fill('2210 Kohler')
  await theirs.getByRole('option').first().click()
  await theirs.getByRole('radio', { name: /Buy and hold|Rental/ }).click()
  await theirs.getByLabel('Call it').fill(`Not yours ${Date.now().toString(36)}`)
  await theirs.getByRole('button', { name: 'See if it works' }).click()
  await theirs.waitForURL(/\/deals\/[0-9a-f-]+$/)
  const theirId = theirs.url().split('/').pop() ?? ''
  await other.close()

  await signIn(page)
  // Someone else's deal must look exactly like one that doesn't exist. A malformed id is
  // turned away by validation instead, and reads the same on screen.
  const cases: [string, number][] = [
    [theirId, 404],
    ['00000000-0000-4000-8000-000000000000', 404],
    ['not-a-real-id', 422],
  ]
  for (const [id, status] of cases) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/v1/deals/${id}`)),
      page.goto(`/deals/${id}`),
    ])
    expect(response.status(), id).toBe(status)
    await expect(page.getByRole('heading', { name: "There's nothing here." })).toBeVisible()
    await noCrash(page)
  }
})

test('settings and sign in pass an accessibility check', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: /Sign in/ }).first()).toBeVisible()
  await accessible(page)

  await signIn(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await accessible(page)
})
