import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

test('the landing page answers with a real deal and passes an accessibility check', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Know if a property makes money.',
  )
  await expect(page.getByText('$308 a month').first()).toBeVisible()
  await accessible(page)
})

test('the demo opens without an account and the workspace explains itself', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Open the demo' }).first().click()
  await expect(page).toHaveURL(/\/deals$/)
  await expect(page.getByRole('article')).toHaveCount(5)

  await page.getByRole('heading', { name: 'Duplex on N 14th' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Duplex on N 14th')
  await expect(page.getByText('Yes, it works')).toBeVisible()
  await expect(page.getByText('$308 a month').first()).toBeVisible()

  await page.getByRole('button', { name: '15.5% a year on your money' }).click()
  await expect(page.getByRole('heading', { name: 'Where 15.5% a year comes from' })).toBeVisible()
  await expect(page.getByText('You put in $61,040')).toBeVisible()

  const rent = page.locator('#in-operations-monthly_rent-input')
  await rent.click()
  await rent.fill('2800')
  await rent.press('Enter')
  await expect(page.getByText('$658 a month')).toBeVisible()
  await expect(page.getByText('22% a year', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Year by year' }).click()
  await expect(page.getByRole('rowheader', { name: 'Year 10' })).toBeVisible()
  await page.getByRole('tab', { name: 'What if' }).click()
  await page.getByRole('button', { name: 'Work it out' }).click()
  await expect(page.getByText(/Price would need to be|No value of price/)).toBeVisible()
  await accessible(page)
})

test('a shared deal reads without an account', async ({ page, browser }) => {
  await page.goto('/demo')
  await page.getByRole('heading', { name: 'Cape Cod flip' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: /^Share/ }).click()
  const url = await page.getByLabel('Share link').inputValue()

  const visitor = await browser.newContext()
  const report = await visitor.newPage()
  await report.goto(url)
  await expect(report.getByRole('heading', { level: 1 })).toHaveText('Cape Cod flip')
  await expect(report.getByText('$21,729 profit')).toBeVisible()
  await expect(report.getByText('Assumptions and where they came from')).toBeVisible()
  await accessible(report)
  await visitor.close()
})

test('a new deal starts from an address with sourced numbers', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('link', { name: 'New deal' }).click()
  await page.getByLabel('Property address').fill('2210 Kohler')
  await page.getByRole('option').first().click()
  await expect(page.getByText('RentCast rent estimate')).toBeVisible()
  await page.getByRole('radio', { name: /Flip/ }).click()
  await page.getByRole('textbox', { name: 'Repairs', exact: true }).fill('38000')
  await page.getByRole('textbox', { name: 'Resale price' }).fill('232000')
  await page.getByRole('button', { name: 'See if it works' }).click()
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2210 Kohler Ave')
  await expect(page.getByText('profit', { exact: true })).toBeVisible()
})
