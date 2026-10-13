import { expect, type Locator } from '@playwright/test'

/**
 * Focus swaps an assumption field from its formatted text to the raw number.
 * Typing before that render lands appends to the old value instead of
 * replacing it, so wait for the raw form first.
 */
export async function setInput(field: Locator, value: string) {
  await field.click()
  await expect(field).toHaveValue(/^-?\d*\.?\d*$/)
  await field.fill(value)
  await field.press('Enter')
}
