import type { components } from './schema.js'

export type Schemas = components['schemas']
export type Inputs = Schemas['DealCreate']['inputs']
export type Flag = Schemas['Flag']
export type Metrics = Schemas['Metrics']
export type Period = Schemas['Period']
export type Analysis = Schemas['Analysis']
export type WholesaleAnalysis = Schemas['WholesaleAnalysis']
export type AnyAnalysis = Analysis | WholesaleAnalysis

export function isWholesale(analysis: AnyAnalysis): analysis is WholesaleAnalysis {
  return 'buyer' in analysis
}

/** The ledger a view draws: the deal's own, or the end buyer's flip for a wholesale. */
export function ledgerOf(analysis: AnyAnalysis): Analysis {
  return isWholesale(analysis) ? analysis.buyer : analysis
}
