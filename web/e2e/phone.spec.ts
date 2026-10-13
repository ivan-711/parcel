import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('on a phone the rail still names its links and the assumptions open in a sheet', async ({
  page,
}) => {
  await page.goto('/demo')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const name of ['Deals', 'Pipeline', 'Portfolio', 'Compare', 'Settings']) {
    const link = nav.getByRole('link', { name })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box?.width, name).toBeGreaterThanOrEqual(40)
    expect(box?.height, name).toBeGreaterThanOrEqual(40)
  }
  await expect(nav.getByRole('button', { name: /Light mode|Dark mode/ })).toBeVisible()

  await page.getByRole('heading', { name: 'Duplex on N 14th' }).click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+$/)
  await expect(page.getByText('$308 a month').first()).toBeVisible()

  await page.getByRole('button', { name: /^Assumptions/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Assumptions' })
  await expect(sheet).toBeVisible()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab')
    await expect(sheet.locator(':focus')).toHaveCount(1)
  }
  const rent = sheet.locator('#in-operations-monthly_rent-input')
  await rent.click()
  await rent.fill('2800')
  await rent.press('Enter')
  await expect(page.getByText('$658 a month')).toBeVisible()
  await expect(page.getByText('$308 a month')).toHaveCount(0)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])

  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Assumptions/ })).toBeFocused()
})
