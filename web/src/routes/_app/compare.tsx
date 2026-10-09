import { createFileRoute } from '@tanstack/react-router'

export interface CompareSearch {
  ids?: string[]
}

export const Route = createFileRoute('/_app/compare')({
  validateSearch: (search: Record<string, unknown>): CompareSearch => {
    const ids = Array.isArray(search.ids)
      ? search.ids.filter((x): x is string => typeof x === 'string')
      : []
    return ids.length ? { ids } : {}
  },
  component: () => <h1>Compare</h1>,
})
