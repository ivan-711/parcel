import { queryOptions } from '@tanstack/react-query'

import { api, unwrap } from './client'
import type { components } from './schema'
import type { Inputs } from './analysis'

export type Schemas = components['schemas']
export type Deal = Schemas['DealOut']
export type DealDetail = Schemas['DealDetail']
export type {
  Analysis,
  AnyAnalysis,
  Flag,
  Inputs,
  Metrics,
  Period,
  WholesaleAnalysis,
} from './analysis'
export { isWholesale, ledgerOf } from './analysis'
export type Stage = Schemas['Stage']
export type Strategy = Schemas['Strategy']
export type Source = Schemas['Source']
export type Provenance = Record<string, Source>
export type Me = Schemas['Me']
export type MemoOut = Schemas['MemoOut']
export type LookupResult = Schemas['LookupResult']
export type Portfolio = Schemas['Portfolio']
export type SensitivityResult = Schemas['SensitivityResult']
export type SimulateResult = Schemas['SimulateResult']
export type SolveResult = Schemas['SolveResult']
export type HoldingInputs = Exclude<Inputs, { strategy: 'wholesale' }>
export type Metric = NonNullable<Schemas['SensitivityRequest']['metric']>
export type SolveField = Schemas['SolveRequest']['field']

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => unwrap(await api.GET('/v1/me')),
})

export const dealsQuery = queryOptions({
  queryKey: ['deals'],
  queryFn: async () => unwrap(await api.GET('/v1/deals')),
})

export const dealQuery = (dealId: string) =>
  queryOptions({
    queryKey: ['deals', dealId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/deals/{deal_id}', {
          params: { path: { deal_id: dealId }, query: { monthly: true } },
        }),
      ),
  })

export const analysisQuery = (inputs: Inputs) =>
  queryOptions({
    queryKey: ['analysis', inputs],
    queryFn: async () => unwrap(await api.POST('/v1/analyze', { body: { inputs, monthly: true } })),
    placeholderData: (previous) => previous,
    staleTime: Infinity,
  })

export const memoQuery = (dealId: string) =>
  queryOptions({
    queryKey: ['deals', dealId, 'memo'],
    queryFn: async () => {
      const result = await api.GET('/v1/deals/{deal_id}/memo', {
        params: { path: { deal_id: dealId } },
      })
      if (result.response.status === 404) return null
      return unwrap(result)
    },
  })

export const portfolioQuery = queryOptions({
  queryKey: ['portfolio'],
  queryFn: async () => unwrap(await api.GET('/v1/portfolio')),
})

export const compareQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ['compare', ids],
    queryFn: async () => unwrap(await api.GET('/v1/compare', { params: { query: { ids } } })),
    enabled: ids.length > 0,
  })

export const sensitivityQuery = (inputs: HoldingInputs, metric: Metric) =>
  queryOptions({
    queryKey: ['sensitivity', inputs, metric],
    queryFn: async () =>
      unwrap(await api.POST('/v1/analyze/sensitivity', { body: { inputs, metric } })),
    staleTime: Infinity,
  })

export const simulateQuery = (inputs: HoldingInputs) =>
  queryOptions({
    queryKey: ['simulate', inputs],
    queryFn: async () =>
      unwrap(await api.POST('/v1/analyze/simulate', { body: { inputs, runs: 10_000, seed: 7 } })),
    staleTime: Infinity,
  })

export const sharedQuery = (token: string) =>
  queryOptions({
    queryKey: ['shared', token],
    queryFn: async () =>
      unwrap(await api.GET('/v1/shared/{token}', { params: { path: { token } } })),
  })
