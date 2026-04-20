export type CommissionScenario = 'same_agent' | 'different_agents'

export interface CommissionBreakdown {
  agencyAmount: number
  listingAgentAmount: number
  sellingAgentAmount: number
  scenario: CommissionScenario
}
