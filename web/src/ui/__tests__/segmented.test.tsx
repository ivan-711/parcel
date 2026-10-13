import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Segmented } from '../segmented'

afterEach(cleanup)

const options = [
  { value: 'overview', label: 'Overview' },
  { value: 'ledger', label: 'Year by year' },
  { value: 'memo', label: 'Memo' },
] as const

it('arrow keys move the selection and the focus together', () => {
  const onChange = vi.fn()
  render(<Segmented options={options} value="overview" onChange={onChange} label="Views" />)
  const first = screen.getByRole('tab', { name: 'Overview' })
  first.focus()
  fireEvent.keyDown(first, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith('ledger')
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Year by year' }))

  fireEvent.keyDown(document.activeElement ?? first, { key: 'ArrowLeft' })
  expect(onChange).toHaveBeenLastCalledWith('memo')
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Memo' }))
})

it('only the selected tab is in the tab order', () => {
  render(<Segmented options={options} value="ledger" onChange={() => undefined} label="Views" />)
  expect(screen.getByRole('tab', { name: 'Year by year' }).getAttribute('tabindex')).toBe('0')
  expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('tabindex')).toBe('-1')
})
