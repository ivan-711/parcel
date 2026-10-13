import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { signIn } from './account'

test.describe.configure({ mode: 'serial' })

const run = Date.now().toString(36)
const rental = `Rental ${run}`
const flip = `Flip ${run}`

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

async function createDeal(
  page: Page,
  {
    address,
    pick,
    strategy,
    name,
    fill = {},
  }: {
    address: string
    pick: string
    strategy: RegExp
    name: string
    fill?: Record<string, string>
  },
) {
  await page.goto('/deals/new')
  await page.getByLabel('Property address').fill(pick)
  await page
    .getByRole('listbox', { name: 'Matching addresses' })
    .getByRole('button')
    .first()
    .click()
  await expect(page.getByText(address)).toBeVisible()
  await page.getByRole('radio', { name: strategy }).click()
  for (const [label, value] of Object.entries(fill)) await page.getByLabel(label).fill(value)
  await page.getByLabel('Call it').fill(name)
  await page.getByRole('button', { name: 'See if it works' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

function column(page: Page, stage: string) {
  return page.getByRole('region', { name: stage, exact: true })
}

function card(page: Page, stage: string, name: string) {
  return column(page, stage).getByRole('article').filter({ hasText: name })
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'pipeline')
})

test('two deals start in analyzing and can be moved by keyboard and by drag', async ({ page }) => {
  await createDeal(page, {
    address: '1420 N 14th St, Sheboygan, WI',
    pick: '1420 N 14th',
    strategy: /Rental/,
    name: rental,
  })
  await createDeal(page, {
    address: '2210 Kohler Ave, Sheboygan, WI',
    pick: '2210 Kohler',
    strategy: /Flip/,
    name: flip,
    fill: { Repairs: '40000', 'Resale price': '260000' },
  })

  await page.goto('/pipeline')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pipeline')
  await expect(card(page, 'Analyzing', rental)).toBeVisible()
  await expect(card(page, 'Analyzing', flip)).toBeVisible()

  const menu = page.getByLabel(`Move ${rental}`)
  await menu.focus()
  await menu.selectOption({ label: 'Move to offer out' })
  await expect(card(page, 'Offer out', rental)).toBeVisible()

  // Native drag and drop needs a couple of moves before the drop registers.
  await card(page, 'Analyzing', flip).hover()
  await page.mouse.down()
  const target = column(page, 'Under contract').getByRole('heading', { level: 2 })
  await target.hover()
  await target.hover()
  await page.mouse.up()
  await expect(card(page, 'Under contract', flip)).toBeVisible()

  await page.reload()
  await expect(card(page, 'Offer out', rental)).toBeVisible()
  await expect(card(page, 'Under contract', flip)).toBeVisible()
  await expect(card(page, 'Analyzing', rental)).toHaveCount(0)
  await expect(card(page, 'Analyzing', flip)).toHaveCount(0)
  await accessible(page)
})

test('the deals list filters by name and shows the pipeline stage', async ({ page }) => {
  await page.goto('/deals')
  await page.getByLabel('Search deals').fill(run)
  const rentalCard = page.getByRole('article').filter({ hasText: rental })
  const flipCard = page.getByRole('article').filter({ hasText: flip })
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(rentalCard).toContainText('Offer out')
  await expect(flipCard).toContainText('Under contract')

  await page.getByLabel('Search deals').fill(flip)
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(flipCard).toBeVisible()
  await expect(rentalCard).toHaveCount(0)

  await page.getByLabel('Search deals').fill('no such deal anywhere')
  await expect(page.getByText('Nothing matches that.')).toBeVisible()
})

test('an owned deal shows on the portfolio with its planned monthly figure', async ({ page }) => {
  await page.goto('/pipeline')
  await page.getByLabel(`Move ${rental}`).selectOption({ label: 'Move to owned' })
  await expect(card(page, 'Owned', rental)).toBeVisible()
  await page.reload()
  await expect(card(page, 'Owned', rental)).toBeVisible()

  await page.goto('/portfolio')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portfolio')
  const property = page.getByRole('article').filter({ hasText: rental })
  await expect(property).toBeVisible()
  // Bought today, so no month has closed yet, but the plan still has a monthly figure.
  await expect(page.getByText(/^[+-]?\$[\d,]+ a month$/)).not.toHaveText('$0 a month')
  await expect(property.getByText('Nothing to record yet.')).toBeVisible()

  const bought = new Date()
  bought.setMonth(bought.getMonth() - 3, 1)
  await property.getByLabel('Bought on').fill(bought.toLocaleDateString('en-CA'))
  await expect(property.getByRole('button', { name: 'Record what happened' })).toHaveCount(3)
  await expect(property.getByText('Running')).toHaveCount(0)

  await property.getByRole('button', { name: 'Record what happened' }).first().click()
  await property.getByLabel('Rent collected').fill('1500')
  await property.getByLabel('Operating costs').fill('500')
  await property.getByLabel('Loan payment').fill('400')
  await property.getByRole('button', { name: 'Save' }).click()
  await expect(property.getByRole('button', { name: 'Change' })).toHaveCount(1)
  await expect(property.getByText(/Running .* (behind|ahead of) plan/)).toBeVisible()
  await expect(page.getByText(/came in against/)).toBeVisible()

  await page.reload()
  await expect(property.getByRole('button', { name: 'Change' })).toHaveCount(1)
  await accessible(page)
})

test('compare puts both deals side by side and marks metrics a strategy lacks', async ({
  page,
}) => {
  await page.goto('/compare')
  const picker = page.getByRole('group', { name: 'Deals to compare' })
  await expect(picker).toBeVisible()
  // Mine go in first, so dropping the others never leaves fewer than two.
  for (const name of [rental, flip]) {
    const pick = picker.getByRole('button', { name })
    if ((await pick.getAttribute('aria-pressed')) !== 'true') await pick.click()
    await expect(pick).toHaveAttribute('aria-pressed', 'true')
  }
  const others = picker.getByRole('button', { pressed: true }).filter({
    hasNotText: new RegExp(`${rental}|${flip}`),
  })
  while (await others.count()) await others.first().click()
  await expect(picker.getByRole('button', { pressed: true })).toHaveCount(2)

  const table = page.getByRole('main')
  await expect(table.getByText('Rental', { exact: true })).toHaveCount(1)
  await expect(table.getByText('Flip', { exact: true })).toHaveCount(1)
  const profit = table.getByText('profit', { exact: true }).locator('..')
  await expect(profit).toContainText('Not in this strategy')
  const yearly = table.getByText('a year on your money', { exact: true }).locator('..')
  await expect(yearly).toContainText('Not in this strategy')
  await expect(
    page
      .getByText('Yes, it works')
      .or(page.getByText(/^(It works, with|No, not)/))
      .first(),
  ).toBeVisible()
  await expect(page.getByText('Not in this strategy').first()).toBeVisible()
  await expect(page.getByText('Things to watch')).toBeVisible()
  await accessible(page)
})
