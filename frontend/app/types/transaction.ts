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
  /**
   * Server-computed flag: `stage === 'completed' && commissionBreakdown !== null`.
   * Exposed via Mongoose virtual so there is a single source of truth for the
   * payout rule; UI code never re-implements it.
   */
  isPayoutReady: boolean
  /**
   * Server-computed flag: the listing and selling agent are the same person.
   * Mirrors the backend commission scenario and saves the UI from comparing
   * populated vs. non-populated refs by hand.
   */
  isSameAgent: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Type guard over the server flag. Pure TS glue, no business logic — simply
 * narrows `commissionBreakdown` to non-null when `isPayoutReady === true`.
 */
export type PayoutReadyTransaction = Transaction & {
  isPayoutReady: true
  commissionBreakdown: CommissionBreakdown
}

export function isPayoutReady(
  tx: Transaction,
): tx is PayoutReadyTransaction {
  return tx.isPayoutReady
}

/**
 * Agent-lens view of a transaction. Returned by `GET /agents/:id/transactions`
 * with the role and the agent's own share pre-computed server-side.
 */
export type AgentRoleInTransaction = 'listing' | 'selling' | 'both'

export interface AgentTransactionView {
  _id: string
  propertyAddress: string
  /** Integer kuruş. */
  totalServiceFee: number
  stage: Stage
  listingAgent: AgentRef
  sellingAgent: AgentRef
  isPayoutReady: boolean
  isSameAgent: boolean
  role: AgentRoleInTransaction
  /** The agent's own share in kuruş; `null` until the transaction is payout-ready. */
  amount: number | null
  createdAt: string
}

/**
 * Aggregate stats returned by `GET /agents/stats`. All monetary fields are
 * integer kuruş. The frontend does zero arithmetic on these numbers.
 */
export interface AgentStats {
  _id: string
  name: string
  email: string
  phone?: string
  deletedAt: string | null
  listingCount: number
  sellingCount: number
  completedCount: number
  totalEarned: number
}

export interface CreateTransactionPayload {
  propertyAddress: string
  /** Integer kuruş. Use `toKurus(tl)` to convert from TL user input. */
  totalServiceFee: number
  listingAgent: string
  sellingAgent: string
}
