import type { AgentRef } from './agent'
import type { CommissionBreakdown } from './commission'
import type { Stage } from './stage'

export type { Stage as TransactionStage }

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
  totalServiceFee: number
  listingAgent: string
  sellingAgent: string
}
