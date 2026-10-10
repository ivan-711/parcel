import { expect, test } from '@playwright/test'

import { signIn } from './account'

test.describe.configure({ mode: 'serial' })

test('a signed in user builds a deal from an address', async ({ page }) => {
  await signIn(page)
  await page.goto('/deals')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deals')
  await expect(page.getByText(/\d+ propert(y|ies) you're looking at\./)).toBeVisible()

  await page.getByRole('link', { name: 'New deal' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New deal')
  const address = page.getByLabel('Property address')
  await address.fill('1420 N 14th')
  await page
    .getByRole('listbox', { name: 'Matching addresses' })
    .getByRole('button')
    .first()
    .click()
  await expect(page.getByText('1420 N 14th St, Sheboygan, WI')).toBeVisible()

  await page.getByRole('radio', { name: /Buy and hold|Rental/ }).click()
  const name = `Rental ${Date.now()}`
  await page.getByLabel('Call it').fill(name)
  await page.getByRole('button', { name: 'See if it works' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
})
