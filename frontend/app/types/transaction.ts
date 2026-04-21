import type { AgentRef } from './agent'
import type { CommissionBreakdown } from './commission'
import type { Stage } from './stage'

export type { Stage as TransactionStage }

/**
 * Monetary amounts (`totalServiceFee`, breakdown fields) are transferred
 * as **integer kuruş** (1 TRY = 100 kuruş). Use `formatTRY` to display and
 * `toKurus` to convert user input before POSTing.
 */
export interface Transaction {
  _id: string
  propertyAddress: string
  totalServiceFee: number
  stage: Stage
  listingAgent: AgentRef
  sellingAgent: AgentRef
  commissionBreakdown?: CommissionBreakdown
  createdAt: string
  updatedAt: string
}

export interface CreateTransactionPayload {
  propertyAddress: string
  /** Integer kuruş. Use `toKurus(tl)` to convert from TL user input. */
  totalServiceFee: number
  listingAgent: string
  sellingAgent: string
}
