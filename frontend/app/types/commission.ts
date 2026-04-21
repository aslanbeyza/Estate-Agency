export type CommissionScenario = 'same_agent' | 'different_agents'

/**
 * Snapshot of the commission policy that produced a breakdown. Stored
 * alongside the numbers so old transactions keep their historical rates
 * even after the live policy changes. Values are basis points (10_000 = 100%).
 */
export interface CommissionPolicySnapshot {
  agencyBps: number
  listingAgentBps: number
}

/** All amounts are integer kuruş (1 TRY = 100 kuruş). */
export interface CommissionBreakdown {
  agencyAmount: number
  listingAgentAmount: number
  sellingAgentAmount: number
  scenario: CommissionScenario
  /**
   * Optional on older records that were calculated before the policy
   * externalization refactor. Present on every breakdown produced going
   * forward.
   */
  policy?: CommissionPolicySnapshot
}
