export type CommissionScenario = 'same_agent' | 'different_agents'

/** All amounts are integer kuruş (1 TRY = 100 kuruş). */
export interface CommissionBreakdown {
  agencyAmount: number
  listingAgentAmount: number
  sellingAgentAmount: number
  scenario: CommissionScenario
}
