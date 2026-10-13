import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { setInput } from './inputs'

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
  // Which element in the sheet has focus, or -1 when focus has left it. Waiting for
  // the number to change after each press keeps the loop in step with the page.
  const focused = () =>
    page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]')
      const active = document.activeElement
      return dialog && active && dialog.contains(active)
        ? [...dialog.querySelectorAll('*')].indexOf(active)
        : -1
    })
  let last = await focused()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab')
    await expect.poll(focused).not.toBe(last)
    last = await focused()
    expect(last, `press ${i}`).toBeGreaterThanOrEqual(0)
  }
  await setInput(sheet.locator('#in-operations-monthly_rent-input'), '2800')
  await expect(page.getByText('$658 a month')).toBeVisible()
  await expect(page.getByText('$308 a month')).toHaveCount(0)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])

  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Assumptions/ })).toBeFocused()
})
