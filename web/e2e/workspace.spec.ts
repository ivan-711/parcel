import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { signIn } from './account'

test.describe.configure({ mode: 'serial' })

const stamp = Date.now().toString(36)
const rentalName = `Rental ${stamp}`
const flipName = `Flip ${stamp}`

let dealUrl = ''

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

async function startDeal(page: Page, search: string, strategy: RegExp, name: string) {
  await page.goto('/deals/new')
  await page.getByLabel('Property address').fill(search)
  await page
    .getByRole('listbox', { name: 'Matching addresses' })
    .getByRole('button')
    .first()
    .click()
  await page.getByRole('radio', { name: strategy }).click()
  await page.getByLabel('Call it').fill(name)
}

async function setInput(page: Page, id: string, value: string) {
  const field = page.locator(`#${id}-input`)
  await field.click()
  await field.fill(value)
  await field.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'workspace')
})

test('a rental opens with a verdict and stats that explain themselves', async ({ page }) => {
  await startDeal(page, '1420 N 14th', /Buy and hold|Rental/, rentalName)
  await page.getByRole('button', { name: 'See if it works' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  dealUrl = page.url()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentalName)

  await expect(page.getByText('Yes, it works')).toBeVisible()
  const tiles = page.getByRole('button', {
    name: /a year on your money|a month|rent covers the loan|paid on closing day/,
  })
  await expect(tiles.first()).toBeVisible()
  expect(await tiles.count()).toBeGreaterThanOrEqual(3)

  await page.getByRole('button', { name: /a year on your money/ }).click()
  await expect(page.getByRole('heading', { name: /^Where .* a year comes from$/ })).toBeVisible()
  await expect(page.getByText(/You put in \$/)).toBeVisible()
  await expect(page.getByText('Something went wrong!')).toHaveCount(0)
})

test('edited assumptions update the figures and survive a reload', async ({ page }) => {
  await page.goto(dealUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentalName)
  const cashFlow = page.locator('#stat-cash_flow b')
  const before = await cashFlow.innerText()
  // Edits save on a short delay, so a reload right away would race the write.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/v1/deals/') && r.ok(),
  )

  await setInput(page, 'in-operations-monthly_rent', '3100')
  await expect(cashFlow).not.toHaveText(before)
  const afterRent = await cashFlow.innerText()

  await setInput(page, 'in-price', '120000')
  await setInput(page, 'in-interest_rate', '5.5')
  await setInput(page, 'in-down_payment_rate', '30')
  await expect(cashFlow).not.toHaveText(afterRent)
  const edited = await cashFlow.innerText()
  await saved

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentalName)
  await expect(page.locator('#in-operations-monthly_rent-input')).toHaveValue('$3,100/mo')
  await expect(page.locator('#in-price-input')).toHaveValue('$120,000')
  await expect(page.locator('#in-interest_rate-input')).toHaveValue('5.5%')
  await expect(page.locator('#in-down_payment_rate-input')).toHaveValue('30%')
  await expect(cashFlow).toHaveText(edited)
})

test('every tab renders, the ledger has monthly rows and what if answers', async ({ page }) => {
  await page.goto(dealUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentalName)
  const broken = page.getByText('Something went wrong!')

  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('tabpanel')).not.toBeEmpty()

  await page.getByRole('tab', { name: 'Year by year' }).click()
  await expect(page.getByRole('rowheader', { name: 'Year 1', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Months' }).click()
  await expect(page.getByRole('rowheader', { name: 'Month 1', exact: true })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Month 2', exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'What if' }).click()
  await page.getByRole('button', { name: 'Work it out' }).click()
  await expect(page.getByText(/would need to be|No value of/)).toBeVisible()
  await expect(page.getByText('What moves the return most')).toBeVisible()
  await page.getByRole('button', { name: 'Run 10,000 versions' }).click()
  await expect(page.getByText(/of runs lose money|This needs Pro/).first()).toBeVisible({
    timeout: 20_000,
  })

  await page.getByRole('tab', { name: 'Memo' }).click()
  await expect(page.getByRole('button', { name: /Write the memo|Rewrite/ })).toBeVisible()
  await page.getByRole('button', { name: /Write the memo|Rewrite/ }).click()
  // A server run without a memo writer says so instead of writing one.
  await expect(
    page.getByText(/checked against the engine|Memos aren.t available right now/).first(),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tabpanel')).not.toBeEmpty()
  await expect(broken).toHaveCount(0)

  await page.getByRole('button', { name: /^Share/ }).click()
  await expect(page.getByLabel('Share link')).toBeVisible()
  await expect(broken).toHaveCount(0)
})

test('a share link reads without an account', async ({ page, browser }) => {
  await page.goto(dealUrl)
  await page.getByRole('button', { name: /^Share/ }).click()
  const url = await page.getByLabel('Share link').inputValue()
  expect(url).toMatch(/\/r\/.+/)

  const visitor = await browser.newContext()
  const report = await visitor.newPage()
  await report.goto(url)
  await expect(report.getByRole('heading', { level: 1 })).toHaveText(rentalName)
  await expect(report.getByText('Assumptions and where they came from')).toBeVisible()
  await expect(report.getByText('Something went wrong!')).toHaveCount(0)
  await visitor.close()
})

test('a flip from another address shows flip stats', async ({ page }) => {
  await startDeal(page, '2210 Kohler', /Flip/, flipName)
  await page.getByRole('textbox', { name: 'Repairs', exact: true }).fill('38000')
  await page.getByRole('textbox', { name: 'Resale price' }).fill('232000')
  await page.getByRole('button', { name: 'See if it works' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(flipName)
  await expect(page.locator('#stat-total_profit')).toBeVisible()
  await expect(page.locator('#stat-horizon')).toBeVisible()
  await expect(page.locator('#stat-cash_flow')).toHaveCount(0)
  await expect(page.getByText('Something went wrong!')).toHaveCount(0)
})

test('the workspace passes an accessibility check', async ({ page }) => {
  await page.goto(dealUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentalName)
  await expect(page.locator('#stat-cash_flow')).toBeVisible()
  await accessible(page)
})
